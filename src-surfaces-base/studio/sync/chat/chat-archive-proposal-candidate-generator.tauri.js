/* H2O Desktop Sync - F14.3.4 chat archive proposal candidate generator
 *
 * Single-purpose generator for **archive** convergence candidates only.
 * Composes F14.3.1 canonicalizer + F14.3.2 diagnostics + F14.3.3 preflight
 * + F14.2.x kernel envelope helpers (identity-kit, replay composer,
 * privacy scanner, result-shape).
 *
 * Public API:
 *   H2O.Desktop.Sync.generateChatArchiveProposalCandidate(input)
 *     -> Promise<result>
 *
 *   H2O.Desktop.Sync.__chatArchiveProposalInstalled
 *   H2O.Desktop.Sync.__chatArchiveProposalVersion
 *
 * Input shape: identical to F14.3.3 preflight input + optional
 *   actorPeerSyncHash, justifyingEvidenceDigests, perEnvelopeSalt.
 * The operation MUST be omitted or equal to "archive". Rename (or any
 * other operation) is rejected at gate 1.
 *
 * Output shape:
 *   {
 *     schema, version,
 *     ok,                          // boolean: no blockers
 *     status,                      // "generated" | "noop" | "blocked"
 *     noop,                        // boolean: archive target already holds
 *     candidate,                   // proposal candidate object (or null)
 *     ledgerRow,                   // generated candidate ledger row (or null)
 *     preflight,                   // the full preflight result (read-only)
 *     blockers, warnings,
 *     observedAtIso
 *   }
 *
 * Candidate shape (redacted only; never raw chatId / title / accountId):
 *   {
 *     kind: "proposal",
 *     subjectType: "chat.metadata",
 *     operation: "chat-metadata-archive-proposed",
 *     operationIntent: "update",
 *     subjectId, lineageId, dedupeKey,
 *     redactionClass: "redacted",
 *     proposedAtIso,
 *     payload: {
 *       proposedOperation: { kind: "chat-archive-update", archived, currentArchived },
 *       expectedPostState: { archived, revisionHashBefore },
 *       predicateVersion: "h2o.chat.archive.predicate.v1",
 *       justifyingEvidenceDigests: string[]
 *     }
 *   }
 *
 * Ledger row shape:
 *   {
 *     schema, candidateId, status: "generated",
 *     subjectId, lineageId, dedupeKey,
 *     operation, operationIntent,
 *     generatedAtIso,
 *     canonicalSnapshotSummary: { subjectId, revisionHash,
 *       originAccountIdHash, schemaVersion, archived },
 *     targetState: { archived }
 *   }
 *
 * Hard boundaries (enforced by construction):
 *   - No publication, no outbox/relay touch, no apply.
 *   - No owner-handoff execution (only validation via preflight).
 *   - No Native interaction, no mirror write.
 *   - No watermark write, no consumed-op write, no storage mutation.
 *   - No rename support (single-purpose generator).
 *   - No raw chatId, title, or accountId in any output field —
 *     enforced by reading only the redacted canonical snapshot + a
 *     defense-in-depth privacy scan on the assembled output.
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
  if (H2O.Desktop.Sync.__chatArchiveProposalInstalled) return;

  var VERSION = '0.1.0-f14.3.4';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-archive-proposal-candidate-generator.v1';
  var LEDGER_ROW_SCHEMA = 'h2o.desktop.sync.chat-archive-proposal-ledger-row.v1';
  var ALLOWED_OPERATION = 'archive';
  var ENVELOPE_OPERATION = 'chat-metadata-archive-proposed';
  var ENVELOPE_OPERATION_INTENT = 'update';
  var ENVELOPE_SUBJECT_TYPE = 'chat.metadata';
  var ENVELOPE_KIND = 'proposal';
  var PREDICATE_VERSION = 'h2o.chat.archive.predicate.v1';

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

  // ── Kernel identity helpers (kernel-first; fall back to canonicalJSON
  //    + sha256Hex composition) ─────────────────────────────────────────
  async function deriveDedupeKey(kernel, parts) {
    if (kernel && typeof kernel.generateDedupeKey === 'function') {
      try {
        var r = await kernel.generateDedupeKey(parts);
        var key = (r && (r.dedupeKey || r.value)) || (typeof r === 'string' ? r : '');
        if (isSha256HexLocal(key)) return key;
      } catch (_) { /* fall through */ }
    }
    if (kernel && typeof kernel.canonicalJSON === 'function' && typeof kernel.sha256Hex === 'function') {
      try {
        return await kernel.sha256Hex(kernel.canonicalJSON({
          subjectId: cleanString(parts.subjectId),
          operation: cleanString(parts.operation),
          baseHash: cleanString(parts.baseHash),
          actorPeerSyncHash: cleanString(parts.actorPeerSyncHash)
        }));
      } catch (_) { /* fall through */ }
    }
    return '';
  }

  async function deriveLineageId(kernel, parts) {
    if (kernel && typeof kernel.generateLineageId === 'function') {
      try {
        var r = await kernel.generateLineageId(parts);
        var lid = (r && (r.lineageId || r.value)) || (typeof r === 'string' ? r : '');
        if (isSha256HexLocal(lid)) return lid;
      } catch (_) { /* fall through */ }
    }
    if (kernel && typeof kernel.canonicalJSON === 'function' && typeof kernel.sha256Hex === 'function') {
      try {
        return await kernel.sha256Hex(kernel.canonicalJSON({
          subjectId: cleanString(parts.subjectId),
          operation: cleanString(parts.operation),
          stamp: cleanString(parts.stamp),
          actorPeerSyncHash: cleanString(parts.actorPeerSyncHash)
        }));
      } catch (_) { /* fall through */ }
    }
    return '';
  }

  async function deriveCandidateId(kernel, parts) {
    if (kernel && typeof kernel.canonicalJSON === 'function' && typeof kernel.sha256Hex === 'function') {
      try {
        return await kernel.sha256Hex(kernel.canonicalJSON({
          dedupeKey: cleanString(parts.dedupeKey),
          stamp: cleanString(parts.stamp)
        }));
      } catch (_) { /* fall through */ }
    }
    return '';
  }

  function makeResult(opts) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      status: opts.status || 'blocked',
      noop: !!opts.noop,
      candidate: opts.candidate || null,
      ledgerRow: opts.ledgerRow || null,
      preflight: opts.preflight || null,
      blockers: opts.blockers || [],
      warnings: opts.warnings || [],
      observedAtIso: opts.observedAtIso || nowIsoSeconds()
    };
  }

  // ── Public API ──────────────────────────────────────────────────────
  async function generateChatArchiveProposalCandidate(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = [];
    var warnings = [];

    // Gate 0: input present
    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return makeResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    // Gate 1: operation must be 'archive' (or omitted; defaulted)
    var operation = (typeof input.operation === 'string' && input.operation.length > 0)
      ? input.operation
      : ALLOWED_OPERATION;
    if (operation !== ALLOWED_OPERATION) {
      addCode(blockers, 'operation-not-archive');
      return makeResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    // Gate 2: expectedTarget.archived must be boolean
    var expectedTarget = isObject(input.expectedTarget) ? input.expectedTarget : null;
    if (!expectedTarget || typeof expectedTarget.archived !== 'boolean') {
      addCode(blockers, 'expected-target-invalid:archive-bool-required');
      return makeResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    // Gate 3: chatRecord must be present
    if (!isObject(input.chatRecord)) {
      addCode(blockers, 'chat-record-missing');
      return makeResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    var sync = getSync();
    var kernel = getKernel();

    // Gate 4: preflight must be available
    if (typeof sync.runChatConvergencePreflight !== 'function') {
      addCode(blockers, 'chat-preflight-unavailable');
      return makeResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    // ── Run preflight (forwards all caller-supplied context) ──────────
    var preflightInput = Object.assign({}, input, {
      operation: ALLOWED_OPERATION,
      expectedTarget: { archived: expectedTarget.archived }
    });
    var preflight;
    try {
      preflight = await sync.runChatConvergencePreflight(preflightInput);
    } catch (_) {
      addCode(blockers, 'preflight-threw');
      return makeResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    // Forward preflight blockers/warnings even on noop paths so callers
    // always see the diagnostic context.
    mergeCodes(warnings, preflight && preflight.warnings);

    if (!preflight || preflight.ok !== true) {
      mergeCodes(blockers, preflight && preflight.blockers);
      addCode(blockers, 'preflight-not-actionable');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight || null,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    if (preflight.noop === true) {
      // Already in target state → no candidate generated.
      return makeResult({
        ok: true, status: 'noop', noop: true,
        candidate: null, ledgerRow: null,
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    if (preflight.actionable !== true) {
      addCode(blockers, 'preflight-not-actionable');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    // Gate 5: kernel identity-kit required
    if (!kernel
        || typeof kernel.canonicalJSON !== 'function'
        || typeof kernel.sha256Hex !== 'function') {
      addCode(blockers, 'kernel-identity-kit-unavailable');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var snapshot = preflight.canonicalSnapshot;
    if (!isObject(snapshot)
        || !isSha256HexLocal(snapshot.subjectId)
        || !isSha256HexLocal(snapshot.revisionHash)) {
      addCode(blockers, 'canonical-snapshot-malformed');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var actorPeerSyncHash = cleanString(input.actorPeerSyncHash);

    // ── Derive identity (kernel-first; deterministic fall-back) ────────
    var dedupeKey = await deriveDedupeKey(kernel, {
      subjectId: snapshot.subjectId,
      operation: ENVELOPE_OPERATION,
      baseHash: snapshot.revisionHash,
      actorPeerSyncHash: actorPeerSyncHash
    });
    if (!isSha256HexLocal(dedupeKey)) {
      addCode(blockers, 'dedupe-key-generation-failed');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var lineageId = await deriveLineageId(kernel, {
      subjectId: snapshot.subjectId,
      operation: ENVELOPE_OPERATION,
      stamp: observedAtIso,
      actorPeerSyncHash: actorPeerSyncHash
    });
    if (!isSha256HexLocal(lineageId)) {
      addCode(blockers, 'lineage-id-generation-failed');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    // ── Optional: explicit replay-defense check on the candidate ──────
    // The preflight already runs this gate; the explicit re-check here is
    // defense in depth and uses the kernel replay composer when present.
    var replayLog = Array.isArray(input.replayLog)
      ? input.replayLog
      : (Array.isArray(input.consumedOperationsLog) ? input.consumedOperationsLog : null);
    if (replayLog && kernel && typeof kernel.composeReplayDefense === 'function') {
      try {
        var rd = kernel.composeReplayDefense({
          subjectId: snapshot.subjectId,
          operation: ENVELOPE_OPERATION,
          revisionHash: snapshot.revisionHash,
          log: replayLog
        });
        if (rd && rd.ok === false) {
          addCode(blockers, 'replay-detected');
          mergeCodes(blockers, rd.blockers);
          mergeCodes(warnings, rd.warnings);
          return makeResult({
            ok: false, status: 'blocked',
            preflight: preflight,
            blockers: blockers, warnings: warnings,
            observedAtIso: observedAtIso
          });
        }
      } catch (_) { /* swallow — preflight gate already enforces */ }
    }

    // ── Assemble the candidate envelope (redacted; identity hashes only) ─
    var candidate = {
      kind: ENVELOPE_KIND,
      subjectType: ENVELOPE_SUBJECT_TYPE,
      operation: ENVELOPE_OPERATION,
      operationIntent: ENVELOPE_OPERATION_INTENT,
      subjectId: snapshot.subjectId,
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      redactionClass: 'redacted',
      proposedAtIso: observedAtIso,
      payload: {
        proposedOperation: {
          kind: 'chat-archive-update',
          archived: expectedTarget.archived,
          currentArchived: snapshot.archived
        },
        expectedPostState: {
          archived: expectedTarget.archived,
          revisionHashBefore: snapshot.revisionHash
        },
        predicateVersion: PREDICATE_VERSION,
        justifyingEvidenceDigests: Array.isArray(input.justifyingEvidenceDigests)
          ? input.justifyingEvidenceDigests.filter(function (d) {
              return typeof d === 'string' && d.length > 0;
            })
          : []
      }
    };

    // ── Assemble the ledger row ────────────────────────────────────────
    var candidateId = await deriveCandidateId(kernel, {
      dedupeKey: dedupeKey,
      stamp: observedAtIso
    });
    if (!isSha256HexLocal(candidateId)) {
      addCode(blockers, 'candidate-id-generation-failed');
      return makeResult({
        ok: false, status: 'blocked',
        preflight: preflight,
        blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso
      });
    }
    var ledgerRow = {
      schema: LEDGER_ROW_SCHEMA,
      candidateId: candidateId,
      status: 'generated',
      subjectId: snapshot.subjectId,
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      operation: ENVELOPE_OPERATION,
      operationIntent: ENVELOPE_OPERATION_INTENT,
      generatedAtIso: observedAtIso,
      canonicalSnapshotSummary: {
        subjectId: snapshot.subjectId,
        revisionHash: snapshot.revisionHash,
        originAccountIdHash: snapshot.originAccountIdHash,
        schemaVersion: snapshot.schemaVersion,
        archived: snapshot.archived
      },
      targetState: {
        archived: expectedTarget.archived
      }
    };

    // ── Defense in depth: scan the assembled output for forbidden fields ──
    if (typeof sync.runChatForbiddenFieldScan === 'function') {
      try {
        var scan = sync.runChatForbiddenFieldScan({
          candidate: candidate,
          ledgerRow: ledgerRow
        });
        if (scan && scan.ok === false) {
          addCode(blockers, 'chat-preflight-output-contains-forbidden-field');
          mergeCodes(blockers, scan.blockers);
          mergeCodes(warnings, scan.warnings);
          return makeResult({
            ok: false, status: 'blocked',
            preflight: preflight,
            blockers: blockers, warnings: warnings,
            observedAtIso: observedAtIso
          });
        }
      } catch (_) { /* swallow — fall through to emit */ }
    }

    return makeResult({
      ok: true, status: 'generated',
      candidate: candidate,
      ledgerRow: ledgerRow,
      preflight: preflight,
      blockers: blockers,
      warnings: warnings,
      observedAtIso: observedAtIso
    });
  }

  // ── Registration (idempotent) ───────────────────────────────────────
  H2O.Desktop.Sync.generateChatArchiveProposalCandidate = generateChatArchiveProposalCandidate;
  H2O.Desktop.Sync.__chatArchiveProposalInstalled = true;
  H2O.Desktop.Sync.__chatArchiveProposalVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
