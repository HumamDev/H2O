/* Current Saved-Chat package projection probe (M05 Phase 2.1).
 *
 * Answers ONE question: what content identity would the real package writer
 * submit to the trusted generation publisher for the current Desktop state,
 * RIGHT NOW, without changing anything?
 *
 * It is the substrate a later increment builds freshness on. It deliberately
 * computes no freshness verdict itself, and knows nothing about generations,
 * FRESH/STALE, coverage or BEST-HISTORICAL.
 *
 * HOW IT STAYS HONEST
 *
 * It drives the SAME buildSavedChatPackageV1 path the writer uses, through the
 * asset-stack injection seam, with a private stack whose CAS is hash-only and
 * whose registry is a no-op. There is no second contentHash implementation and
 * no forked projector: a probe hash that disagreed with the writer would be
 * worse than useless, so the only way to guarantee agreement is to run the
 * same code.
 *
 * `skipAssetMaterialization` is NOT usable for this: it suppresses inline
 * asset extraction, which decides v1-vs-v2, so it would answer a different
 * question than the writer asks.
 *
 * WHAT IT NEVER DOES
 *   - no package file write, no CAS write, no directory creation;
 *   - no Tauri filesystem invoke of any kind, not even an existence probe;
 *   - no SQLite mutation, no asset registry upsert, no turn link.
 *
 * WHY READINESS GATING IS LOAD-BEARING
 *
 * The authoritative projection stores can return null/empty on an unready
 * backend rather than failing loudly. Projecting through that would produce a
 * clean-looking hash derived from incomplete data — which a freshness consumer
 * would read as "content changed" and act on. So an unready store yields
 * INDETERMINATE and no hash at all, rather than a hash nobody should trust.
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

  var MODULE_VERSION = '1.0.0-m05-p21';

  /* The projection authorities. `assets` is deliberately ABSENT: the probe
   * replaces the asset registry/CAS stack entirely, so requiring it ready
   * would refuse probes that do not need it. */
  var REQUIRED_STORES = ['chats', 'snapshots', 'folders', 'categories', 'labels', 'tags'];

  var STATUS_OK = 'ok';
  var STATUS_INDETERMINATE = 'indeterminate';
  var STATUS_NO_SNAPSHOT = 'undefined-no-snapshot';

  function safeObject(value) { return value && typeof value === 'object' ? value : {}; }
  function cleanString(value) { return typeof value === 'string' ? value.trim() : ''; }

  function indeterminate(reason, extra) {
    /* No contentHash on a non-ok result: downstream code must not be able to
     * mistake a partial projection for freshness authority. */
    return Object.assign({
      status: STATUS_INDETERMINATE,
      reason: reason,
      chatId: '',
      snapshotId: '',
      schemaVersion: null,
      payloadVersion: null,
      contentHash: '',
      assetShas: [],
    }, safeObject(extra));
  }

  function storeNamespace() {
    return (H2O.Studio && H2O.Studio.store) || {};
  }

  /* Uses the stores' own readiness semantics rather than inventing a second
   * backend authority. A store that exposes neither isReady nor diagnose but
   * is present is treated as ready — absence of a readiness signal is not
   * evidence of unreadiness. */
  function storeReadiness() {
    var stores = storeNamespace();
    var notReady = [];
    for (var i = 0; i < REQUIRED_STORES.length; i += 1) {
      var name = REQUIRED_STORES[i];
      var store = stores[name];
      if (!store) { notReady.push(name); continue; }
      var ready = true;
      if (typeof store.isReady === 'function') {
        try { ready = store.isReady() === true; } catch (_) { ready = false; }
      } else if (typeof store.diagnose === 'function') {
        try {
          var d = store.diagnose();
          if (d && typeof d.ready === 'boolean') ready = d.ready;
        } catch (_) { ready = false; }
      }
      if (!ready) notReady.push(name);
    }
    return { ready: notReady.length === 0, notReady: notReady };
  }

  /* ── The private, mutation-free asset stack ───────────────────────────── */

  /* Hash-only CAS. Returns exactly the descriptor fields the package projector
   * consumes, derived the same way the real CAS derives them, and touches
   * nothing. It does not probe for existence: whether an object is already
   * stored is irrelevant to identity, and asking would be a filesystem call. */
  function createProbeCas(realCas) {
    var codec = H2O.Studio.ingestion.savedChatPackageCodec;
    var capBytes = realCas && typeof realCas.assetBlobCapBytes === 'number'
      ? realCas.assetBlobCapBytes
      : 0;
    var puts = 0;
    return {
      /* Reuses the REAL governed authority; never a second literal.
       *
       * Publishing it is load-bearing in its own right: the materializer's
       * whole-snapshot pre-scan reads `assetCas.assetBlobCapBytes` and refuses
       * an oversized snapshot before any asset is handed to putAssetBytes. So
       * the bound is enforced at TWO independent layers here — the published
       * cap and the check below — and removing either one alone still refuses.
       * Neither is redundant: dropping the published cap blinds the pre-scan,
       * and dropping the check below removes the last line of defence if a
       * future caller reaches putAssetBytes directly. */
      assetBlobCapBytes: capBytes,
      putCount: function () { return puts; },
      putAssetBytes: async function (input) {
        var opts = safeObject(input);
        var bytes = opts.bytes;
        if (!bytes || typeof bytes.length !== 'number') {
          throw new Error('probe putAssetBytes: bytes are required');
        }
        if (capBytes && bytes.length > capBytes) {
          /* Same governed bound as the real CAS, so a package the writer could
           * never publish is never given a probe identity either. */
          var err = new Error(
            'probe putAssetBytes: asset exceeds the governed ingest bound: ' +
            bytes.length + ' > ' + capBytes + ' bytes'
          );
          err.code = 'asset-bound-exceeded';
          throw err;
        }
        if (!codec || typeof codec.sha256PrefixedBytes !== 'function') {
          throw new Error('probe putAssetBytes: savedChatPackageCodec.sha256PrefixedBytes unavailable');
        }
        puts += 1;
        var sha256 = await codec.sha256PrefixedBytes(bytes);
        return {
          sha256: sha256,
          byteLength: bytes.length,
          mimeType: cleanString(opts.mimeType),
          ext: cleanString(opts.ext),
          /* Shape parity with the real CAS result; no path is touched. */
          deduped: false,
          wrote: false,
        };
      },
    };
  }

  /* No-op registry. The materializer requires these to exist and ignores what
   * they return, so a no-op is behaviourally complete for projection. */
  function createProbeStore() {
    var calls = 0;
    return {
      mutationCount: function () { return calls; },
      upsert: async function () { calls += 0; return null; },
      linkToTurn: async function () { calls += 0; return null; },
    };
  }

  function createProbeStack() {
    var ing = H2O.Studio.ingestion || {};
    return {
      materializer: ing.savedChatPackageAssets,
      assetCas: createProbeCas(ing.assetCas),
      assetStore: createProbeStore(),
    };
  }

  /* ── The probe ────────────────────────────────────────────────────────── */

  async function probeCurrentSavedChatProjectionV1(options) {
    var opts = safeObject(options);
    var build = H2O.Studio.ingestion && H2O.Studio.ingestion.buildSavedChatPackageV1;
    if (typeof build !== 'function') {
      return indeterminate('projector-unavailable');
    }

    var readiness = storeReadiness();
    if (!readiness.ready) {
      /* Never hash partial data: an unready store can answer null/empty
       * without erroring, which would look like changed content. */
      return indeterminate('store-not-ready', { notReady: readiness.notReady });
    }

    var stack;
    try {
      stack = createProbeStack();
    } catch (err) {
      return indeterminate('probe-stack-unavailable');
    }
    if (!stack.materializer || typeof stack.materializer.materializeInlineImageAssetsV2 !== 'function') {
      return indeterminate('asset-materializer-unavailable');
    }

    var built;
    try {
      built = await build({
        chatId: cleanString(opts.chatId) || undefined,
        snapshotId: cleanString(opts.snapshotId) || undefined,
        /* The seam: same builder, private stack. */
        assetStack: stack,
      });
    } catch (err) {
      var message = String((err && err.message) || err);
      if (err && err.code === 'asset-bound-exceeded') {
        /* Not stale and not fresh: this state is not publishable at all, so
         * asserting either would be wrong. */
        return indeterminate('asset-bound-exceeded');
      }
      if (/no snapshots found|snapshot not found/i.test(message)) {
        return {
          status: STATUS_NO_SNAPSHOT,
          reason: 'no-current-snapshot',
          chatId: cleanString(opts.chatId),
          snapshotId: cleanString(opts.snapshotId),
          schemaVersion: null,
          payloadVersion: null,
          contentHash: '',
          assetShas: [],
        };
      }
      if (/exceeds the governed ingest bound/i.test(message)) {
        return indeterminate('asset-bound-exceeded');
      }
      return indeterminate('projection-failed', { error: message });
    }

    var manifest = safeObject(built.manifest);
    var assetShas = (built.manifest && Array.isArray(manifest.assets) ? manifest.assets : [])
      .map(function (a) { return cleanString(a && a.sha256); })
      .filter(Boolean);

    return {
      status: STATUS_OK,
      reason: '',
      chatId: cleanString(manifest.chatId),
      snapshotId: cleanString(manifest.snapshotId),
      schemaVersion: typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : null,
      payloadVersion: typeof manifest.payloadVersion === 'number' ? manifest.payloadVersion : null,
      /* Exactly what the writer would submit for this state. */
      contentHash: cleanString(built.contentHash || manifest.contentHash),
      assetShas: assetShas,
    };
  }

  function diagnoseSavedChatProjectionProbeV1() {
    return {
      installed: true,
      version: MODULE_VERSION,
      requiredStores: REQUIRED_STORES.slice(),
      mutatesFilesystem: false,
      mutatesStore: false,
      usesRealProjector: true,
      statuses: [STATUS_OK, STATUS_INDETERMINATE, STATUS_NO_SNAPSHOT],
    };
  }

  H2O.Studio.ingestion.probeCurrentSavedChatProjectionV1 = probeCurrentSavedChatProjectionV1;
  H2O.Studio.ingestion.diagnoseSavedChatProjectionProbeV1 = diagnoseSavedChatProjectionProbeV1;
})(typeof window !== 'undefined' ? window : globalThis);
