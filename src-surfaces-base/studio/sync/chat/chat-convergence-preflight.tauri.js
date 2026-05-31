/* H2O Desktop Sync - F14.3.3 read-only chat convergence preflight
 *
 * Read-only "is this safe to become proposal-eligible?" gate over the
 * F14.3.0 canonical chat model. Composes the F14.3.1 canonicalizer + the
 * F14.3.2 diagnostics + the F14.2.x kernel (identity, privacy, blockers,
 * watermark service, consumed-op, tombstone reader, replay composer,
 * owner-handoff validation).
 *
 * Public API:
 *   H2O.Desktop.Sync.runChatConvergencePreflight({
 *     chatRecord,                  // raw chat record (Native mirror / Library Index / Registry Core)
 *     operation,                   // "archive" | "rename"
 *     expectedTarget,              // shape depends on operation (see below)
 *     // optional context (every input below is best-effort; missing inputs warn but do not block)
 *     localAccountIdHash,          // sha256 hex of the device's account
 *     ownerDeclaration,            // kernel owner declaration shape
 *     ownerStatus,                 // "reachable" | "unreachable" (caller-supplied probe outcome)
 *     mirrorLastSyncIso,           // ISO; staleness reference
 *     freshnessWindowMs,           // numeric override; default 5min
 *     tombstoneLog,                // [{ recordKind, subjectId|subjectIdHash, recordId, deletedAt, ... }]
 *     consumedOperationsLog,       // [{ subjectId, revisionHash, operation, ... }]
 *     currentWatermark,            // kernel watermark shape
 *     proposedWatermark,           // kernel watermark shape (must be >= current)
 *     replayLog,                   // alias for consumedOperationsLog when supplied directly
 *     observedAtIso                // ISO; defaults to now
 *   }) -> Promise<result>
 *
 *   H2O.Desktop.Sync.__chatPreflightInstalled
 *   H2O.Desktop.Sync.__chatPreflightVersion
 *
 * expectedTarget shapes:
 *   archive: { archived: boolean }
 *   rename:  { title: string }   -- device-local only; the raw title is hashed
 *                                   into a titleHash; the raw title NEVER appears
 *                                   in any preflight output field
 *
 * Result shape:
 *   {
 *     schema, version,
 *     ok,                     // boolean: no blockers
 *     actionable,             // boolean: ok && !noop
 *     operation,              // "archive" | "rename" | "" if invalid
 *     noop,                   // boolean: the requested target state already holds
 *     canonicalSnapshot,      // redacted F14.3.0 snapshot (or null on early failure)
 *     targetSummary,          // hashes only — never raw title
 *     blockers,               // [{code}]
 *     warnings,               // [{code}]
 *     validationSummary,      // boolean flags per gate
 *     observedAtIso
 *   }
 *
 * Hard boundaries (enforced by construction):
 *   - no proposal, no publication, no outbox / relay touch
 *   - no apply, no Native write, no mirror write
 *   - no owner-handoff execution (only kernel handoff *validation*)
 *   - no watermark write (only kernel watermark *validation*)
 *   - no consumed-op write (only kernel consumed-op *read* via assistConsumedSafe
 *     and composeReplayDefense)
 *   - no storage mutation of any kind
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
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__chatPreflightInstalled) return;

  var VERSION = '0.1.0-f14.3.3';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-convergence-preflight.v1';
  var ALLOWED_OPERATIONS = ['archive', 'rename'];

  // ── Tiny helpers ────────────────────────────────────────────────────
  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return typeof value === 'string' ? value : '';
  }
  function getSync() { return (H2O && H2O.Desktop && H2O.Desktop.Sync) || {}; }
  function getKernel() { return getSync().kernel || null; }
  function addCode(list, code) {
    var normalized = cleanString(code).trim();
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }
  function mergeCodes(into, from) {
    if (!Array.isArray(from)) return;
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      if (entry && typeof entry === 'object' && typeof entry.code === 'string') {
        addCode(into, entry.code);
      } else if (typeof entry === 'string') {
        addCode(into, entry);
      }
    }
  }
  function isSha256HexLocal(s) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(s); } catch (_) { /* fall through */ }
    }
    return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  }

  // Watermark monotonicity fallback (kernel-first; numeric/string lex compare).
  function compareWatermarksInternal(current, proposed) {
    if (current === null || current === undefined) return true;
    if (typeof current === 'number' && typeof proposed === 'number') return proposed >= current;
    if (typeof current === 'string' && typeof proposed === 'string') return proposed >= current;
    if (isObject(current) && isObject(proposed)) {
      if (typeof current.value === 'number' && typeof proposed.value === 'number') {
        return proposed.value >= current.value;
      }
      if (typeof current.iso === 'string' && typeof proposed.iso === 'string') {
        return proposed.iso >= current.iso;
      }
    }
    return false;
  }

  // Replay-defense fallback: any log entry whose (subjectId, operation,
  // revisionHash) tuple matches the candidate ⇒ replay.
  function internalReplayCheck(subjectId, operation, revisionHash, log) {
    if (!Array.isArray(log)) return true;
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      if (!isObject(entry)) continue;
      if (entry.subjectId === subjectId
          && entry.operation === operation
          && entry.revisionHash === revisionHash) {
        return false;
      }
    }
    return true;
  }

  function scanChatDomainForbiddenFields(target, opts) {
    var options = isObject(opts) ? opts : {};
    var kernel = getKernel();
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scanTarget = target;
        if (options.deviceLocalInput === true && isObject(target)) {
          scanTarget = Object.assign({}, target, { redactionClass: 'device-local' });
        }
        return kernel.scanDomainForbiddenFields('chat.metadata', scanTarget);
      }
      catch (_) { /* fall through */ }
    }
    var sync = getSync();
    if (typeof sync.runChatForbiddenFieldScan === 'function') {
      try { return sync.runChatForbiddenFieldScan(target); }
      catch (_) { /* fall through */ }
    }
    return null;
  }

  // Empty validation summary (every gate starts false; flipped to true as it passes).
  function emptySummary() {
    return {
      operationAllowed: false,
      canonicalizationOk: false,
      crossAccountSafe: false,
      nativeOwnerReachable: false,
      mirrorNotStale: false,
      tombstoneClear: false,
      forbiddenFieldsClear: false,
      consumedSafe: false,
      watermarkSafe: false,
      replaySafe: false,
      expectedTargetValid: false
    };
  }

  // Defensive result assembler that recomputes ok/actionable and runs an
  // output-side forbidden-field scan as the final safety net. If the scan
  // hits, the result is REPLACED with a blocker-only envelope (no
  // canonicalSnapshot, no targetSummary) so a leak can never escape.
  function assembleResult(parts) {
    var blockers = parts.blockers || [];
    var warnings = parts.warnings || [];
    var ok = blockers.length === 0;
    var noop = !!parts.noop;
    var result = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      actionable: ok && !noop,
      operation: parts.operation || '',
      noop: noop,
      canonicalSnapshot: parts.canonicalSnapshot || null,
      targetSummary: parts.targetSummary || null,
      blockers: blockers,
      warnings: warnings,
      validationSummary: parts.validationSummary || emptySummary(),
      observedAtIso: parts.observedAtIso || nowIsoSeconds()
    };

    var outScan = scanChatDomainForbiddenFields(result);
    if (outScan && outScan.ok === false) {
      var leakBlockers = blockers.slice();
      addCode(leakBlockers, 'chat-preflight-output-contains-forbidden-field');
      mergeCodes(leakBlockers, outScan.blockers);
      return {
        schema: RESULT_SCHEMA,
        version: VERSION,
        ok: false,
        actionable: false,
        operation: parts.operation || '',
        noop: false,
        canonicalSnapshot: null,
        targetSummary: null,
        blockers: leakBlockers,
        warnings: warnings,
        validationSummary: parts.validationSummary || emptySummary(),
        observedAtIso: parts.observedAtIso || nowIsoSeconds()
      };
    }
    return result;
  }

  // ── Public API ──────────────────────────────────────────────────────
  async function runChatConvergencePreflight(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = [];
    var warnings = [];
    var summary = emptySummary();
    var canonicalSnapshot = null;
    var targetSummary = null;
    var noop = false;
    var operation = (isObject(input) && typeof input.operation === 'string') ? input.operation : '';

    // Gate 0: input present
    if (!isObject(input)) {
      addCode(blockers, 'preflight-input-missing');
      return assembleResult({
        operation: operation, blockers: blockers, warnings: warnings,
        validationSummary: summary, observedAtIso: observedAtIso
      });
    }

    // Gate 1: operation allowed
    if (ALLOWED_OPERATIONS.indexOf(operation) === -1) {
      addCode(blockers, 'operation-not-allowed');
    } else {
      summary.operationAllowed = true;
    }

    var sync = getSync();
    var kernel = getKernel();

    // Gate 2: canonicalize chatRecord (also catches forbidden fields *in the record*)
    if (typeof sync.canonicalizeChatMetadata !== 'function') {
      addCode(blockers, 'chat-canonicalizer-unavailable');
      return assembleResult({
        operation: operation, blockers: blockers, warnings: warnings,
        validationSummary: summary, observedAtIso: observedAtIso
      });
    }
    var canonResult;
    try {
      canonResult = await sync.canonicalizeChatMetadata(input.chatRecord);
    } catch (_) {
      addCode(blockers, 'canonicalizer-threw');
      return assembleResult({
        operation: operation, blockers: blockers, warnings: warnings,
        validationSummary: summary, observedAtIso: observedAtIso
      });
    }
    if (!canonResult || canonResult.quarantined || !canonResult.snapshot) {
      var reason = (canonResult && canonResult.quarantineReason) || 'canonicalization-failed';
      addCode(blockers, reason);
      mergeCodes(blockers, canonResult && canonResult.blockers);
      mergeCodes(warnings, canonResult && canonResult.warnings);
      return assembleResult({
        operation: operation, blockers: blockers, warnings: warnings,
        validationSummary: summary, observedAtIso: observedAtIso
      });
    }
    canonicalSnapshot = canonResult.snapshot;
    summary.canonicalizationOk = true;
    mergeCodes(warnings, canonResult.warnings);

    // Gate 3: cross-account identity safety
    if (typeof sync.runCrossAccountIdentityCheck === 'function') {
      var x = await sync.runCrossAccountIdentityCheck({
        snapshot: canonicalSnapshot,
        localAccountIdHash: input.localAccountIdHash
      });
      if (x && x.ok && x.match) {
        summary.crossAccountSafe = true;
      } else {
        mergeCodes(blockers, x && x.blockers);
      }
      mergeCodes(warnings, x && x.warnings);
    } else {
      addCode(warnings, 'cross-account-diagnostic-unavailable');
    }

    // Gate 4: native owner reachability
    if (typeof sync.runNativeOwnerReachabilityProbe === 'function') {
      var n = sync.runNativeOwnerReachabilityProbe({
        ownerDeclaration: input.ownerDeclaration,
        status: input.ownerStatus
      });
      if (n && n.ok && n.reachable) {
        summary.nativeOwnerReachable = true;
      } else {
        mergeCodes(blockers, n && n.blockers);
      }
      mergeCodes(warnings, n && n.warnings);
    } else {
      addCode(warnings, 'native-owner-diagnostic-unavailable');
    }

    // Gate 5: mirror staleness
    if (typeof sync.runMirrorStalenessProbe === 'function') {
      var s = sync.runMirrorStalenessProbe({
        snapshot: canonicalSnapshot,
        observedAtIso: input.snapshotObservedAtIso || canonicalSnapshot.observedAtIso,
        mirrorLastSyncIso: input.mirrorLastSyncIso,
        freshnessWindowMs: input.freshnessWindowMs
      });
      if (s && s.ok && s.fresh) {
        summary.mirrorNotStale = true;
      } else {
        mergeCodes(blockers, s && s.blockers);
      }
      mergeCodes(warnings, s && s.warnings);
    } else {
      addCode(warnings, 'mirror-staleness-diagnostic-unavailable');
    }

    // Gate 6: chat tombstone check (F5 reader)
    if (typeof sync.runChatTombstoneCheck === 'function') {
      var t = await sync.runChatTombstoneCheck({
        snapshot: canonicalSnapshot,
        tombstoneLog: input.tombstoneLog
      });
      if (t && t.ok && t.absent) {
        summary.tombstoneClear = true;
      } else {
        mergeCodes(blockers, t && t.blockers);
      }
      mergeCodes(warnings, t && t.warnings);
    } else {
      addCode(warnings, 'tombstone-check-unavailable');
    }

    // Gate 7: forbidden-fields scan on the expectedTarget (the chatRecord
    // was already scanned by the canonicalizer; expectedTarget is fresh
    // caller input and must be checked here).
    summary.forbiddenFieldsClear = true;
    var fs = scanChatDomainForbiddenFields({ expectedTarget: input.expectedTarget }, { deviceLocalInput: true });
    if (fs && fs.ok === false) {
      summary.forbiddenFieldsClear = false;
      mergeCodes(blockers, fs.blockers);
      mergeCodes(warnings, fs.warnings);
    } else if (!fs) {
      addCode(warnings, 'forbidden-field-scan-unavailable');
    } else {
      mergeCodes(warnings, fs.warnings);
    }

    // Gate 8: consumed-op safety (via materialization diagnostic's
    // assistConsumedSafe pass-through). We deliberately consume ONLY the
    // consumed-operation-not-safe blocker so we don't duplicate gates 3-7.
    if (typeof sync.runChatMaterializationDiagnostic === 'function') {
      var m = await sync.runChatMaterializationDiagnostic({
        snapshot: canonicalSnapshot,
        localAccountIdHash: input.localAccountIdHash,
        consumedOperationsLog: input.consumedOperationsLog
      });
      if (m && m.consumedSafe === true) {
        summary.consumedSafe = true;
      } else if (Array.isArray(m && m.blockers)) {
        for (var mi = 0; mi < m.blockers.length; mi++) {
          var mb = m.blockers[mi];
          if (mb && mb.code === 'consumed-operation-not-safe') {
            addCode(blockers, mb.code);
          }
        }
      }
      mergeCodes(warnings, m && m.warnings);
    } else {
      addCode(warnings, 'materialization-diagnostic-unavailable');
    }

    // Gate 9: watermark safety (kernel watermark service — validate only)
    if (input.currentWatermark !== undefined && input.proposedWatermark !== undefined) {
      var wmOk = false;
      if (kernel && typeof kernel.validateWatermarkMonotonicity === 'function') {
        try {
          var wm = kernel.validateWatermarkMonotonicity({
            current: input.currentWatermark,
            proposed: input.proposedWatermark
          });
          if (wm && wm.ok === true) {
            wmOk = true;
          } else if (wm) {
            mergeCodes(blockers, wm.blockers);
            mergeCodes(warnings, wm.warnings);
          }
        } catch (_) {
          wmOk = compareWatermarksInternal(input.currentWatermark, input.proposedWatermark);
        }
      } else {
        wmOk = compareWatermarksInternal(input.currentWatermark, input.proposedWatermark);
      }
      if (wmOk) summary.watermarkSafe = true;
      else addCode(blockers, 'watermark-monotonicity-violation');
    } else {
      addCode(warnings, 'watermark-input-not-provided');
      summary.watermarkSafe = true; // best-effort safe when caller does not assert
    }

    // Gate 10: replay safety (kernel replay composer — validate only)
    var replayLog = Array.isArray(input.replayLog)
      ? input.replayLog
      : (Array.isArray(input.consumedOperationsLog) ? input.consumedOperationsLog : null);
    if (Array.isArray(replayLog)) {
      var replayOk = false;
      if (kernel && typeof kernel.composeReplayDefense === 'function') {
        try {
          var rd = kernel.composeReplayDefense({
            subjectId: canonicalSnapshot.subjectId,
            operation: operation,
            revisionHash: canonicalSnapshot.revisionHash,
            log: replayLog
          });
          if (rd && rd.ok === true) {
            replayOk = true;
          } else if (rd) {
            mergeCodes(blockers, rd.blockers);
            mergeCodes(warnings, rd.warnings);
          }
        } catch (_) {
          replayOk = internalReplayCheck(canonicalSnapshot.subjectId, operation, canonicalSnapshot.revisionHash, replayLog);
        }
      } else {
        replayOk = internalReplayCheck(canonicalSnapshot.subjectId, operation, canonicalSnapshot.revisionHash, replayLog);
      }
      if (replayOk) summary.replaySafe = true;
      else addCode(blockers, 'replay-unsafe');
    } else {
      addCode(warnings, 'replay-log-not-provided');
      summary.replaySafe = true; // best-effort safe when caller does not assert
    }

    // Gate 11: operation-specific target validation + noop classification
    if (operation === 'archive') {
      var et = isObject(input.expectedTarget) ? input.expectedTarget : null;
      if (!et || typeof et.archived !== 'boolean') {
        addCode(blockers, 'expected-target-invalid:archive-bool-required');
      } else {
        summary.expectedTargetValid = true;
        if (canonicalSnapshot.archived === et.archived) {
          noop = true;
        }
        targetSummary = {
          operation: 'archive',
          archived: et.archived,
          currentArchived: canonicalSnapshot.archived,
          noop: noop
        };
      }
    } else if (operation === 'rename') {
      var et2 = isObject(input.expectedTarget) ? input.expectedTarget : null;
      if (!et2 || typeof et2.title !== 'string') {
        addCode(blockers, 'expected-target-invalid:title-string-required');
      } else {
        var normalized = et2.title.trim();
        if (normalized.length === 0) {
          addCode(blockers, 'expected-target-invalid:title-empty');
        } else if (!kernel || typeof kernel.sha256Hex !== 'function') {
          addCode(blockers, 'kernel-identity-kit-unavailable');
        } else {
          var newTitleHash = null;
          try {
            newTitleHash = await kernel.sha256Hex(et2.title);
          } catch (_) {
            addCode(blockers, 'title-hash-failed');
          }
          if (newTitleHash !== null) {
            if (!isSha256HexLocal(newTitleHash)) {
              addCode(blockers, 'title-hash-malformed');
            } else {
              summary.expectedTargetValid = true;
              if (canonicalSnapshot.titleHash === newTitleHash) {
                noop = true;
              }
              // CRITICAL: raw title NEVER included in targetSummary or anywhere
              //           else in the result. titleHash is the redacted projection.
              targetSummary = {
                operation: 'rename',
                titleHash: newTitleHash,
                currentTitleHash: canonicalSnapshot.titleHash,
                noop: noop
              };
            }
          }
        }
      }
    }
    // (operation already validated at Gate 1; no else branch needed)

    return assembleResult({
      operation: operation,
      noop: noop,
      canonicalSnapshot: canonicalSnapshot,
      targetSummary: targetSummary,
      blockers: blockers,
      warnings: warnings,
      validationSummary: summary,
      observedAtIso: observedAtIso
    });
  }

  // ── Registration (idempotent) ───────────────────────────────────────
  H2O.Desktop.Sync.runChatConvergencePreflight = runChatConvergencePreflight;
  H2O.Desktop.Sync.__chatPreflightInstalled = true;
  H2O.Desktop.Sync.__chatPreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
