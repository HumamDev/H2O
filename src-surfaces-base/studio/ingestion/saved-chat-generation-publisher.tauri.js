/* Saved Chat generation publisher bridge (M05 G1).
 *
 * The smallest production bridge that drives the trusted Rust generation
 * publisher. It builds the sanctioned live v1/v2 package with the EXISTING
 * package construction authority, stages the four governed members through the
 * fixed member enum, and commits through trusted Rust.
 *
 * Authority boundaries this module must never cross (§O):
 *   - it never names the final generation destination — Rust derives it from
 *     its own recomputed contentHash;
 *   - it never names a member path — the member enum is the whole surface;
 *   - it never names a CAS source path — Rust locates assets from verified
 *     manifest identities;
 *   - it never adjudicates an occupied generation — DEDUPED is a trusted-side
 *     verdict (§N.2), consumed here, never inferred.
 *
 * The builder's packageDirName/packagePath are LEGACY CONSTRUCTION METADATA
 * only. They are deliberately not read here.
 *
 * Out of scope for G1: the Phase 2 pure freshness projection.
 *
 * Contracts: docs/systems/archive/saved-chat-generations.md
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

  var MODULE_VERSION = '1.0.0-m05-g1';
  var BEGIN_COMMAND = 'h2o_archive_generation_begin';
  var WRITE_COMMAND = 'h2o_archive_generation_write_member';
  var COMMIT_COMMAND = 'h2o_archive_generation_commit';
  var ABORT_COMMAND = 'h2o_archive_generation_abort';

  /* Transport chunk, not a member or package ceiling. A member of any size is
   * delivered as N appends; the trusted side enforces the operational reserve
   * per append. */
  var CHUNK_BYTES = 4 * 1024 * 1024;

  /* Fixed member enum → the trusted side owns the filenames. */
  var MEMBER_ORDER = ['snapshot', 'markdown', 'html', 'manifest'];
  var MEMBER_SOURCE = {
    snapshot: 'snapshot.json',
    markdown: 'chat.md',
    html: 'chat.html',
    manifest: 'manifest.json',
  };

  var state = { lastPublishAt: null, lastError: null, publishCount: 0, dedupeCount: 0 };

  function cleanString(value) { return typeof value === 'string' ? value.trim() : ''; }

  function getTauriInvoke() {
    var internals = global.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === 'function') return internals.invoke;
    var legacy = global.__TAURI__;
    if (legacy && typeof legacy.invoke === 'function') return legacy.invoke;
    if (legacy && legacy.core && typeof legacy.core.invoke === 'function') return legacy.core.invoke;
    return null;
  }

  function invoke(cmd, args, extra) {
    var fn = getTauriInvoke();
    if (!fn) throw new Error('tauri invoke unavailable for ' + cmd);
    return fn(cmd, args, extra);
  }

  function textBytes(text) {
    return new TextEncoder().encode(String(text == null ? '' : text));
  }

  function blockerCodes(result) {
    var list = (result && result.blockers) || [];
    return list.map(function (b) { return cleanString(b && b.code); }).filter(Boolean);
  }

  function advisoryCodes(result) {
    var list = (result && result.advisories) || [];
    return list.map(function (b) { return cleanString(b && b.code); }).filter(Boolean);
  }

  /* One member, delivered as N bounded appends. */
  async function stageMember(token, member, bytes) {
    var offset = 0;
    /* An empty member is still staged, so the trusted side sees it exist. */
    do {
      var end = Math.min(offset + CHUNK_BYTES, bytes.length);
      var chunk = bytes.subarray(offset, end);
      var ack = await invoke(WRITE_COMMAND, chunk, {
        headers: {
          options: JSON.stringify({ token: token, member: member }),
        },
      });
      if (!ack || ack.ok !== true) {
        var err = new Error('generation member write refused: ' + blockerCodes(ack).join(','));
        err.blockers = blockerCodes(ack);
        throw err;
      }
      offset = end;
    } while (offset < bytes.length);
  }

  /* Publishes an already-built sanctioned package as an immutable generation.
   * `built` is the output of buildSavedChatPackageV1/V2. */
  async function publishBuiltPackageV1(built) {
    if (!built || !built.files) throw new Error('publishBuiltPackage: a built package is required');
    var chatId = cleanString(built.manifest && built.manifest.chatId);
    if (!chatId) throw new Error('publishBuiltPackage: manifest.chatId is required');

    var begun = await invoke(BEGIN_COMMAND, { options: { chatId: chatId } });
    if (!begun || begun.ok !== true) {
      var beginErr = new Error('generation begin refused: ' + blockerCodes(begun).join(','));
      beginErr.blockers = blockerCodes(begun);
      throw beginErr;
    }
    var token = begun.token;

    var committed = false;
    try {
      for (var i = 0; i < MEMBER_ORDER.length; i += 1) {
        var member = MEMBER_ORDER[i];
        var file = built.files[MEMBER_SOURCE[member]];
        if (!file) throw new Error('built package is missing required member ' + MEMBER_SOURCE[member]);
        var bytes = file.bytes instanceof Uint8Array ? file.bytes : textBytes(file.text);
        await stageMember(token, member, bytes);
      }

      var result = await invoke(COMMIT_COMMAND, { options: { token: token } });
      committed = true; /* COMMIT consumes the session, success or refusal. */

      var codes = blockerCodes(result);
      if (!result || result.ok !== true) {
        var failErr = new Error('generation commit refused: ' + codes.join(','));
        failErr.blockers = codes;
        failErr.outcome = result && result.outcome;
        throw failErr;
      }

      state.lastPublishAt = new Date().toISOString();
      state.publishCount += 1;
      var deduped = result.outcome === 'deduped' || result.outcome === 'DEDUPED';
      if (deduped) state.dedupeCount += 1;
      return {
        ok: true,
        /* Trusted verdicts, consumed verbatim — never inferred here. */
        outcome: result.outcome,
        committed: result.committed === true,
        deduped: deduped,
        durabilityComplete: result.durabilityComplete === true || result.durability_complete === true,
        generationPath: cleanString(result.generationPath || result.generation_path),
        contentHash: cleanString(result.contentHash || result.content_hash),
        blockers: codes,
        /* Non-blocking: observable, never gating. */
        advisories: advisoryCodes(result),
      };
    } catch (err) {
      if (!committed) {
        /* Benign no-op on an unknown or already-consumed token. */
        try { await invoke(ABORT_COMMAND, { options: { token: token } }); } catch (_) { /* ignore */ }
      }
      state.lastError = String((err && err.message) || err);
      throw err;
    }
  }

  function diagnoseSavedChatGenerationPublisherV1() {
    return {
      installed: true,
      version: MODULE_VERSION,
      commands: [BEGIN_COMMAND, WRITE_COMMAND, COMMIT_COMMAND, ABORT_COMMAND],
      chunkBytes: CHUNK_BYTES,
      members: MEMBER_ORDER.slice(),
      derivesFinalPath: false,
      adjudicatesOccupant: false,
      publishCount: state.publishCount,
      dedupeCount: state.dedupeCount,
      lastPublishAt: state.lastPublishAt,
      lastError: state.lastError,
    };
  }

  H2O.Studio.ingestion.publishSavedChatGenerationV1 = publishBuiltPackageV1;
  H2O.Studio.ingestion.diagnoseSavedChatGenerationPublisherV1 = diagnoseSavedChatGenerationPublisherV1;
})(typeof window !== 'undefined' ? window : globalThis);
