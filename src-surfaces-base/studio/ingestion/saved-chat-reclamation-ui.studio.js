/* H2O Studio — Saved Chat Storage / Reclamation overview (M06 P2 T2.4)
 *
 * New UI only. A read-only operator surface mounted as a sibling beneath the
 * Archive Health card, following the same pattern as the inspector, importer
 * and exporter cards.
 *
 * READ-ONLY AND ANALYZE ONLY. This card exposes exactly one action — Analyze —
 * and no destructive control of any kind exists here, not even a disabled one:
 * G02 requires destructive UI to remain invisible until it is activated, and a
 * dormant "Reclaim" button would already be destructive UI.
 *
 * It decides nothing. Every judgement is made by trusted Rust:
 *
 *   - the current-projection verdict comes from the existing
 *     probeCurrentSavedChatProjectionV1 producer (no second contentHash or
 *     projection implementation is added here);
 *   - protection, candidacy, the K=3 floor and the on-disk projection witness
 *     are decided by h2o_archive_reclamation_preview;
 *   - residue evidence comes from the composed T1.3 diagnostics, which covers
 *     BOTH residue families — the durable-temp probe alone is not the whole
 *     residue picture.
 *
 * The renderer's package inventory is used ONLY to decide which chats to ask
 * the projection producer about. It is never reclamation authority: projection
 * facts are enabling-only, so a chat the inventory misses simply fails closed
 * and is protected. Nothing here is truncated to fit a UI limit.
 *
 * Contracts: docs/systems/archive/saved-chat-reclamation.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.reclamationUi && H2O.Studio.reclamationUi.__installed) return;

  var MODULE_VERSION = '0.1.0-m06-p2-t2.4';
  var PREVIEW_COMMAND = 'h2o_archive_reclamation_preview';
  var PREVIEW_SCHEMA = 'h2o.m06.reclamationPreview';

  var TEXT = {
    title: 'Storage & reclamation',
    subtitle: 'Read-only analysis. Nothing is deleted, renamed or moved.',
    idle: 'Analyze the archive to see what is protected and what is currently eligible under the retention policy.',
    loading: 'Analyzing archive…',
    unavailable: 'Archive analysis is available in Desktop Studio only.',
    analyzeButton: 'Analyze archive',
    error: 'Could not complete the analysis.',
    incomplete: 'This analysis is incomplete. The results below are not authoritative.',
    completeEmpty: 'Analysis complete. Nothing is currently eligible under the retention policy.',
    noPackages: 'No saved chat packages found yet.',
    candidateNote: 'Eligible means the read-only engine currently considers it within policy. Nothing has been removed.',
    casNote: 'Analysis only. M06 does not remove content-addressed objects.',
    residueIncomplete: 'Residue enumeration was incomplete, so this is not a complete residue count.',
  };

  function safeObject(value) {
    return (value && typeof value === 'object') ? value : {};
  }
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function cleanString(value) {
    return (typeof value === 'string') ? value.trim() : '';
  }

  /* Every value that came back from a trusted command is DATA. It is written
   * with textContent, never interpolated into markup, so a path, blocker code
   * or reason string can never become executable. */
  function el(tag, text, style) {
    var node = global.document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (style) node.setAttribute('style', style);
    return node;
  }

  /* ── Analyze input assembly ───────────────────────────────────────────────
   * The chat set comes from the archive inventory purely to know WHICH chats
   * to probe. It is enabling-only: an omitted chat has no verdict and the
   * trusted engine fails it closed. Nothing is capped here — the bound lives
   * in the command, and an over-bound request must surface as a refusal
   * rather than a silent truncation. */
  function chatIdsFromDiagnostics(diagnostics) {
    var seen = {};
    var out = [];
    asArray(safeObject(diagnostics).packages).forEach(function (pkg) {
      var chatId = cleanString(safeObject(pkg).chatId);
      if (!chatId || seen[chatId]) return;
      seen[chatId] = true;
      out.push(chatId);
    });
    out.sort();
    return out;
  }

  async function collectProjections(chatIds, probe) {
    var out = [];
    for (var i = 0; i < chatIds.length; i += 1) {
      var chatId = chatIds[i];
      var verdict = { status: 'indeterminate', contentHash: '' };
      try {
        /* The EXISTING producer. No projection or contentHash logic is
         * implemented in this card. */
        var probed = safeObject(await probe({ chatId: chatId }));
        verdict = {
          status: cleanString(probed.status) || 'indeterminate',
          contentHash: cleanString(probed.contentHash),
        };
      } catch (_) {
        /* A failed probe is reported honestly as indeterminate. It is never
         * upgraded to ok, and never backfilled with a historical package
         * hash — the engine must fail that chat closed. */
        verdict = { status: 'probe-failed', contentHash: '' };
      }
      out.push({ chatId: chatId, status: verdict.status, contentHash: verdict.contentHash });
    }
    return out;
  }

  function getInvoke() {
    var internals = global.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    var tauri = global.__TAURI__;
    if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
    if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    return null;
  }

  /* ── Pure presentation model ──────────────────────────────────────────────
   * Derived ONLY from fields the trusted Preview actually returned. No
   * classification, retention or candidacy is recomputed here. */
  function formatPreviewOverview(preview) {
    var p = safeObject(preview);
    var plan = safeObject(p.plan);
    var sources = safeObject(p.sources);
    var totals = safeObject(plan.totals);
    var cas = safeObject(plan.cas);
    var blockers = asArray(plan.blockers).map(cleanString).filter(Boolean);

    var sourcesComplete = sources.packageScanComplete !== false
      && sources.dbProbeComplete !== false;
    var complete = plan.complete === true && sourcesComplete;

    return {
      schema: cleanString(p.schema),
      schemaVersion: p.schemaVersion,
      complete: complete,
      /* An incomplete analysis is NEVER the same statement as "nothing is
       * eligible", so the two are distinct states rather than one message. */
      state: complete ? (totals.candidates ? 'eligible' : 'clean') : 'incomplete',
      retentionFloor: plan.retentionFloor,
      totals: {
        occupants: totals.occupants || 0,
        protected: totals.protected || 0,
        candidates: totals.candidates || 0,
        excluded: totals.excluded || 0,
        chatsInScope: totals.chatsInScope || 0,
      },
      sources: {
        packageScanComplete: sources.packageScanComplete !== false,
        dbProbeComplete: sources.dbProbeComplete !== false,
        casInventoryComplete: sources.casInventoryComplete !== false,
        blockers: []
          .concat(asArray(sources.packageScanBlockers).map(cleanString))
          .concat(asArray(sources.dbProbeBlockers).map(cleanString))
          .concat(asArray(sources.casInventoryBlockers).map(cleanString))
          .filter(Boolean),
      },
      blockers: blockers,
      cas: {
        complete: cas.complete === true,
        observed: asArray(cas.observed).length,
        referenced: asArray(cas.referenced).length,
        observedUnreferenced: asArray(cas.observedUnreferenced),
        incompleteReasons: asArray(cas.incompleteReasons).map(cleanString).filter(Boolean),
      },
    };
  }

  /* One row per decision, preserving EVERY protection reason. Writing +
   * Import + Floor must not collapse into a generic "protected". */
  function formatDecisionRows(preview) {
    var plan = safeObject(safeObject(preview).plan);
    return asArray(plan.decisions).map(function (entry) {
      var d = safeObject(entry);
      var evidence = safeObject(d.evidence);
      return {
        path: cleanString(d.path),
        name: cleanString(d.name),
        chatId: cleanString(d.chatId),
        decision: cleanString(d.decision),
        reasons: asArray(d.reasons).map(cleanString).filter(Boolean),
        exclusionReason: cleanString(d.reason),
        savedAt: cleanString(evidence.savedAt),
        familyRank: evidence.familyRank,
      };
    }).sort(function (a, b) {
      if (a.path === b.path) return 0;
      return a.path < b.path ? -1 : 1;
    });
  }

  /* Residue comes from the COMPOSED T1.3 diagnostics, which covers
   * generation-staging AND durable-temp. The durable-temp probe alone would
   * under-report, so it is never used as the total on its own. */
  function formatResidueOverview(diagnostics) {
    var residue = safeObject(safeObject(diagnostics).residue);
    var entries = asArray(residue.entries).map(function (item) {
      var e = safeObject(item);
      return { path: cleanString(e.path), name: cleanString(e.name), kind: cleanString(e.kind) };
    });
    var kinds = {};
    entries.forEach(function (e) { if (e.kind) kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    return {
      complete: residue.complete === true,
      count: typeof residue.count === 'number' ? residue.count : entries.length,
      entries: entries,
      kinds: kinds,
      unscanned: asArray(residue.unscanned).map(function (s) {
        var u = safeObject(s);
        return { root: cleanString(u.root), family: cleanString(u.family), reason: cleanString(u.reason) };
      }),
    };
  }

  function renderInto(container, overview, rows, residue) {
    container.textContent = '';
    var sub = el('div', TEXT.subtitle, 'opacity:.75;margin-bottom:8px');
    container.appendChild(sub);

    if (!overview.complete) {
      container.appendChild(el('div', TEXT.incomplete, 'color:#d29922;margin-bottom:6px'));
    } else if (!overview.totals.candidates) {
      container.appendChild(el('div', TEXT.completeEmpty, 'margin-bottom:6px'));
    }

    var counts = el('div', null, 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px');
    [
      ['Protected', overview.totals.protected],
      ['Eligible', overview.totals.candidates],
      ['Excluded', overview.totals.excluded],
      ['Chats analyzed', overview.totals.chatsInScope],
      ['Retention floor', overview.retentionFloor],
    ].forEach(function (pair) {
      var box = el('div', null, 'min-width:96px');
      box.appendChild(el('div', pair[0], 'opacity:.7;font-size:11px'));
      box.appendChild(el('div', pair[1]));
      counts.appendChild(box);
    });
    container.appendChild(counts);
    if (overview.totals.candidates) {
      container.appendChild(el('div', TEXT.candidateNote, 'opacity:.75;margin-bottom:8px'));
    }

    var src = el('div', null, 'margin-bottom:8px');
    src.appendChild(el('div', 'Trusted sources', 'opacity:.7;font-size:11px'));
    [
      ['Package scan', overview.sources.packageScanComplete],
      ['Database probe', overview.sources.dbProbeComplete],
      ['CAS inventory', overview.sources.casInventoryComplete],
    ].forEach(function (pair) {
      src.appendChild(el('div', pair[0] + ': ' + (pair[1] ? 'complete' : 'incomplete')));
    });
    container.appendChild(src);

    overview.blockers.concat(overview.sources.blockers).forEach(function (code) {
      container.appendChild(el('div', 'Blocker: ' + code, 'color:#f85149'));
    });

    var casBox = el('div', null, 'margin-top:8px');
    casBox.appendChild(el('div', 'Read-only CAS analysis', 'opacity:.7;font-size:11px'));
    casBox.appendChild(el('div', 'Observed objects: ' + overview.cas.observed));
    casBox.appendChild(el('div', 'Referenced: ' + overview.cas.referenced));
    casBox.appendChild(el('div', 'Observed unreferenced: ' + overview.cas.observedUnreferenced.length));
    casBox.appendChild(el('div', TEXT.casNote, 'opacity:.75'));
    if (!overview.cas.complete) {
      casBox.appendChild(el('div', 'CAS analysis incomplete.', 'color:#d29922'));
    }
    container.appendChild(casBox);

    var residueBox = el('div', null, 'margin-top:8px');
    residueBox.appendChild(el('div', 'Archive residue', 'opacity:.7;font-size:11px'));
    residueBox.appendChild(el('div', 'Total residue entries: ' + residue.count));
    Object.keys(residue.kinds).sort().forEach(function (kind) {
      residueBox.appendChild(el('div', kind + ': ' + residue.kinds[kind]));
    });
    residue.entries.forEach(function (entry) {
      residueBox.appendChild(el('div', entry.path, 'opacity:.8;font-family:monospace;font-size:11px'));
    });
    if (!residue.complete) {
      residueBox.appendChild(el('div', TEXT.residueIncomplete, 'color:#d29922'));
      residue.unscanned.forEach(function (u) {
        residueBox.appendChild(el('div', 'Not scanned: ' + u.root + ' ' + u.family, 'opacity:.75'));
      });
    }
    container.appendChild(residueBox);

    var details = el('div', null, 'margin-top:8px');
    rows.forEach(function (row) {
      var line = el('div', null, 'font-family:monospace;font-size:11px');
      line.appendChild(el('span', row.path));
      line.appendChild(el('span', '  ' + row.decision));
      var why = row.reasons.length ? row.reasons.join(', ') : row.exclusionReason;
      if (why) line.appendChild(el('span', '  ' + why));
      if (row.savedAt) line.appendChild(el('span', '  ' + row.savedAt));
      details.appendChild(line);
    });
    container.appendChild(details);
  }

  function mountReclamationCard(container, options) {
    if (!container || !global.document) return null;
    var opts = safeObject(options);
    var ingestion = safeObject(safeObject(H2O.Studio).ingestion);
    var diagnose = typeof opts.diagnose === 'function'
      ? opts.diagnose
      : ingestion.diagnoseSavedChatArchiveV1;
    var probe = typeof opts.probeProjection === 'function'
      ? opts.probeProjection
      : ingestion.probeCurrentSavedChatProjectionV1;
    var invoke = typeof opts.invoke === 'function' ? opts.invoke : getInvoke();

    var card = global.document.createElement('section');
    card.setAttribute('data-h2o-card', 'saved-chat-reclamation');
    card.appendChild(el('h3', TEXT.title));

    var body = el('div', TEXT.idle);
    var button = el('button', TEXT.analyzeButton);
    button.setAttribute('type', 'button');
    button.setAttribute('data-h2o-action', 'analyze-archive');
    card.appendChild(button);
    card.appendChild(body);
    container.appendChild(card);

    if (typeof diagnose !== 'function' || typeof probe !== 'function' || !invoke) {
      body.textContent = TEXT.unavailable;
      button.disabled = true;
      return { analyze: function () { return Promise.resolve(null); }, getState: function () { return { state: 'unavailable' }; } };
    }

    /* One Analyze in flight at a time, and a monotonic token so a slow earlier
     * response can never overwrite a newer one. */
    var inFlight = false;
    var latestToken = 0;
    var state = { state: 'idle', preview: null };

    async function analyze() {
      if (inFlight) return null;
      inFlight = true;
      latestToken += 1;
      var token = latestToken;
      button.disabled = true;
      body.textContent = TEXT.loading;
      state = { state: 'loading', preview: null };
      try {
        var diagnostics = safeObject(await diagnose({ includeDbChecks: false }));
        var chatIds = chatIdsFromDiagnostics(diagnostics);
        var projections = await collectProjections(chatIds, probe);
        /* Exactly the bounded T2.3 contract. No path, no floor, no force. */
        var preview = await invoke(PREVIEW_COMMAND, { request: { projections: projections } });
        if (token !== latestToken) return null;
        var overview = formatPreviewOverview(preview);
        var rows = formatDecisionRows(preview);
        var residue = formatResidueOverview(diagnostics);
        renderInto(body, overview, rows, residue);
        state = { state: overview.state, preview: preview };
        return preview;
      } catch (err) {
        if (token !== latestToken) return null;
        body.textContent = '';
        body.appendChild(el('div', TEXT.error, 'color:#f85149'));
        body.appendChild(el('div', String((err && err.message) || err), 'opacity:.8'));
        state = { state: 'error', preview: null };
        return null;
      } finally {
        if (token === latestToken) {
          inFlight = false;
          button.disabled = false;
        }
      }
    }

    button.addEventListener('click', function () { analyze(); });
    /* NO analyze on mount, no timer, no interval, no polling. */
    return { analyze: analyze, getState: function () { return state; } };
  }

  H2O.Studio.reclamationUi = {
    __installed: true,
    __version: MODULE_VERSION,
    PREVIEW_COMMAND: PREVIEW_COMMAND,
    PREVIEW_SCHEMA: PREVIEW_SCHEMA,
    mountReclamationCard: mountReclamationCard,
    formatPreviewOverview: formatPreviewOverview,
    formatDecisionRows: formatDecisionRows,
    formatResidueOverview: formatResidueOverview,
    chatIdsFromDiagnostics: chatIdsFromDiagnostics,
  };
})(typeof window !== 'undefined' ? window : globalThis);
