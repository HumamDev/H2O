/* H2O Studio — Saved Chat Recovery Center, timeline surface (Mission T02)
 *
 * New UI only. A read-only operator surface mounted as a sibling beneath the
 * Archive Health card, following the same pattern as the inspector, importer,
 * exporter and reclamation cards.
 *
 * WHAT IT IS: the first surface that answers "what versions of THIS chat does
 * the archive still hold, and which one is current?" — a per-chat version
 * timeline, plus a read-only detail view of one selected version.
 *
 * IT DECIDES NOTHING. Every fact on screen was established by an authority that
 * already owns it, and this module composes exactly four of them:
 *
 *   1. readSavedChatArchiveIntegrityV1()      trusted archive enumeration and
 *                                             package validity (once per open
 *                                             or refresh — never per row);
 *   2. archiveHealthMapping.partitionOccupants()
 *                                             the canonical occupant partition,
 *                                             never re-implemented here;
 *   3. describeSavedChatCoverageV1({chatId})  the per-chat version populations
 *                                             and the frozen freshness rule,
 *                                             for the SELECTED chat only;
 *   4. archiveInspector.inspectPackage()      the read-only detail view, for the
 *                                             SELECTED version only.
 *
 * Labels come from the shared presentation adapter, so this surface does not
 * invent a second vocabulary for "current" and "historical".
 *
 * It therefore performs NO semantic verification, NO contentHash or
 * representationHash derivation, NO validity decision, NO classification, NO
 * package-name grammar, NO filesystem discovery, NO ordering authority, NO
 * recovery-eligibility judgement and NO completeness authority.
 *
 * ORDERING (the one that matters). Version order is COVERAGE's order. This
 * module contains no comparator and calls no sort: it renders each coverage
 * population in the order coverage already produced, and never interleaves two
 * of them into a single invented sequence. A filename, an mtime, a
 * manifest.generatedAt, a queue timestamp and an insertion index are all
 * non-authorities here, and no timestamp is synthesized. `savedAt` is DISPLAYED
 * because it lives inside the hashed snapshot — it is content, not metadata —
 * but it never decides position.
 *
 * INCOMPLETE EVIDENCE IS SHOWN, NEVER SWALLOWED. When the trusted enumeration
 * reports `complete === false`, or coverage could not assert freshness, the card
 * says so in the Archive Health wording, and absence is never presented as a
 * conclusion.
 *
 * SELECTABILITY. Only rows addressing a package trusted verification ACCEPTED
 * can be selected. Unusable occupants stay VISIBLE — hiding a damaged package is
 * how an operator concludes their chat was never saved — but they cannot be
 * selected, and this module publishes no universal "recoverable" bit: whether
 * anything may be recovered from a version is a later Task's question, and no
 * answer to it is claimed, stored or implied here.
 *
 * BOUNDARY. Read-only. No preview of restorable content, no recovery, no
 * import, restore, relink or confirmation flow, and no DB, archive or CAS
 * mutation of any kind. There is deliberately no destructive control here, not
 * even a disabled one.
 *
 * Public API (H2O.Studio.recoveryCenterUi):
 *   mountRecoveryCenterCard(healthContainer, options)
 *   renderRecoveryCenterCard(container, options)
 *   buildChatIndex(packageOccupants) -> pure
 *   buildTimelineSections(coverage, entryPresentation) -> pure
 *   TEXT
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.recoveryCenterUi && H2O.Studio.recoveryCenterUi.__installed) return;

  var MODULE_VERSION = '0.1.0-recovery-center-t02';

  /* The inspector's scope guard, mirrored so an unscoped or absolute path can
   * never leave this surface. It is a safety gate, never an authority: the path
   * itself is always the trusted occupant's own archive-relative path. */
  var PACKAGE_ROOT = 'archive/packages';

  /* Chats are grouped by the TRUSTED chatId the verifier proved. An occupant
   * with no proven chatId is NOT attributed to a chat by parsing its basename —
   * that is name-grammar authority this surface does not hold. It is shown in
   * its own clearly-labelled group instead, so it is never silently dropped. */
  var UNATTRIBUTED = ' unattributed';

  var TEXT = {
    title: 'Saved Chat Recovery Center',
    unavailable: 'The Recovery Center is available in Desktop Studio only.',
    loading: 'Reading the saved chat archive…',
    loadingChat: 'Reading saved versions for this chat…',
    loadingVersion: 'Reading this version…',
    error: 'Could not read the saved chat archive.',
    empty: 'No saved chat packages found yet.',
    emptyHint: 'Save a chat to a folder to create a package.',
    refreshButton: 'Refresh',
    chatLabel: 'Chat',
    chatPlaceholder: 'Select a chat…',
    noVersions: 'No saved versions were found for this chat.',
    unattributedLabel: 'Unattributed packages',
    /* Reused verbatim from the Archive Health surface, so an incomplete scan
     * reads identically wherever an operator meets it. */
    partialPill: 'Partial scan',
    partialHeadline: 'Archive discovery was incomplete.',
    partialNote: 'Archive discovery was incomplete; absence cannot be concluded.',
    freshnessNotAsserted: 'Current state could not be determined, so these versions are not marked current or historical.',
    sectionCurrent: 'Current',
    sectionCurrentNote: 'Matches the chat as it stands now.',
    sectionHistorical: 'Earlier versions',
    sectionHistoricalNote: 'Preserved, and not the current content.',
    sectionGenerations: 'Preserved generations',
    sectionLegacy: 'Preserved legacy packages',
    sectionUnusable: 'Damaged or unreadable',
    sectionUnusableNote: 'Trusted verification refused these. They are shown so they are not mistaken for absence, and cannot be selected.',
    detailHeading: 'Version detail',
    detailIdle: 'Select a version to see its details.',
    detailUnavailable: 'This version could not be read.',
    blockersHeading: 'Reported problems',
    /* This is a read-only surface. The boundary is stated on screen so the
     * absence of any action is understood as deliberate. */
    readOnlyNote: 'Read-only. Nothing on this card changes the archive.',
  };

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return typeof value === 'string' ? value.trim() : ''; }

  function el(tag, text, style) {
    var node = global.document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (style) node.setAttribute('style', style);
    return node;
  }

  function packageDirNameForPath(packagePath) {
    var p = cleanString(packagePath).replace(/[/\\]+$/g, '');
    var idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(idx + 1) : p;
  }

  /* CONTAINMENT, not grammar. A selector must be an archive-relative path inside
   * the known package root, with no traversal and no absolute or Windows form.
   *
   * It deliberately does NOT test the package extension. Which basenames are
   * packages is name-grammar authority owned trusted-side, and the sanctioned
   * readers of that vocabulary are a pinned set this surface is not part of. The
   * path here always came from a trusted occupant the verifier already
   * classified, and the inspector re-applies its own full scope check before
   * reading anything, so containment is the whole job at this layer. */
  function isScopedPackagePath(packagePath) {
    var p = cleanString(packagePath);
    var prefix = PACKAGE_ROOT + '/';
    if (!p || p.indexOf(prefix) !== 0) return false;
    if (p.indexOf('..') >= 0 || p.indexOf('\\') >= 0) return false;
    /* Exactly ONE segment below the package root: a package directory, never
     * the root itself and never anything nested deeper inside a package. */
    var leaf = p.slice(prefix.length);
    return !!leaf && leaf.indexOf('/') < 0;
  }

  /* ── Chat index ───────────────────────────────────────────────────────────
   *
   * Built from the ONE trusted enumeration, after the canonical partition has
   * already removed reserved infrastructure and non-package strays.
   *
   * The listing order is the trusted producer's own enumeration order, carried
   * through unchanged. This module does not sort it and attaches no meaning to
   * it — it is not recency, not importance and not size. */
  function buildChatIndex(packageOccupants) {
    var order = [];
    var byId = {};
    asArray(packageOccupants).forEach(function (occupant) {
      var o = safeObject(occupant);
      var path = cleanString(o.path);
      if (!path) return;
      var proven = cleanString(o.chatId);
      var key = proven || UNATTRIBUTED;
      if (!Object.prototype.hasOwnProperty.call(byId, key)) {
        byId[key] = {
          chatId: proven,
          attributed: !!proven,
          label: proven || TEXT.unattributedLabel,
          packageCount: 0,
        };
        order.push(key);
      }
      byId[key].packageCount += 1;
    });
    return order.map(function (key) { return byId[key]; });
  }

  /* ── Timeline rows ────────────────────────────────────────────────────────
   *
   * One row per coverage entry, labelled by the shared presentation adapter.
   * `selectable` is a UI affordance derived from the trusted classification: it
   * says the row addresses a package trusted verification accepted, and says
   * nothing whatever about whether a recovery from it would be permitted. */
  function rowFor(entry, coverage, entryPresentation, allowSelection) {
    var e = safeObject(entry);
    var p = safeObject(entryPresentation(e, coverage));
    var kind = cleanString(p.kind);
    var packagePath = cleanString(p.packagePath);
    var trustedValid = (kind === 'generation' || kind === 'legacy');
    return {
      packagePath: packagePath,
      packageDirName: cleanString(p.packageDirName) || packageDirNameForPath(packagePath),
      kind: kind,
      kindLabel: cleanString(p.kindLabel),
      freshness: cleanString(p.freshness),
      freshnessLabel: cleanString(p.freshnessLabel),
      isCurrent: p.isCurrent === true,
      isHistoricalOnly: p.isHistoricalOnly === true,
      /* Recomputed by the trusted verifier from the stored bytes. */
      contentHash: cleanString(p.contentHash),
      schemaVersion: typeof p.schemaVersion === 'number' ? p.schemaVersion : null,
      /* Content, not filesystem metadata — displayed, never positional. */
      savedAt: cleanString(e.savedAt),
      blockers: asArray(p.blockers).map(cleanString).filter(Boolean),
      selectable: allowSelection === true && trustedValid && isScopedPackagePath(packagePath),
    };
  }

  /* Pure: coverage populations -> ordered, labelled sections.
   *
   * Each section renders ONE coverage array in coverage's own order. Two
   * populations are never merged into a single invented sequence, which is
   * precisely how an ordering authority would creep back in. */
  function buildTimelineSections(coverage, entryPresentation) {
    var cov = safeObject(coverage);
    var present = typeof entryPresentation === 'function'
      ? entryPresentation
      : safeObject(safeObject(safeObject(H2O.Studio).ingestion).savedChatArchivePresentationV1).entryPresentation;
    if (typeof present !== 'function') return [];

    var projection = safeObject(cov.projection);
    var freshnessAsserted = cleanString(projection.status) === 'ok'
      && !!cleanString(projection.contentHash);

    var sections = [];
    function push(key, title, note, entries, allowSelection) {
      var rows = asArray(entries).map(function (entry) {
        return rowFor(entry, cov, present, allowSelection);
      });
      if (rows.length) sections.push({ key: key, title: title, note: note, rows: rows });
    }

    if (freshnessAsserted) {
      push('current', TEXT.sectionCurrent, TEXT.sectionCurrentNote, cov.fresh, true);
      push('historical', TEXT.sectionHistorical, TEXT.sectionHistoricalNote, cov.stale, true);
    } else {
      /* Coverage refused to assert freshness, so neither may this card. The
       * valid populations are still shown — they are preserved either way. */
      push('preserved-generations', TEXT.sectionGenerations, TEXT.freshnessNotAsserted, cov.generations, true);
      push('preserved-legacy', TEXT.sectionLegacy, TEXT.freshnessNotAsserted, cov.legacy, true);
    }
    push('unusable', TEXT.sectionUnusable, TEXT.sectionUnusableNote, cov.unusable, false);
    return sections;
  }

  function allRowsOf(sections) {
    var rows = [];
    asArray(sections).forEach(function (section) {
      asArray(safeObject(section).rows).forEach(function (row) { rows.push(row); });
    });
    return rows;
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  function renderRecoveryCenterCard(container, options) {
    if (!container || !global.document) return null;
    var opts = safeObject(options);
    var ingestion = safeObject(safeObject(H2O.Studio).ingestion);
    var mapping = safeObject(safeObject(H2O.Studio).archiveHealthMapping);
    var inspector = safeObject(safeObject(H2O.Studio).archiveInspector);

    var readIntegrity = typeof opts.readIntegrity === 'function'
      ? opts.readIntegrity : ingestion.readSavedChatArchiveIntegrityV1;
    var partitionOccupants = typeof opts.partitionOccupants === 'function'
      ? opts.partitionOccupants : mapping.partitionOccupants;
    var describeCoverage = typeof opts.describeCoverage === 'function'
      ? opts.describeCoverage : ingestion.describeSavedChatCoverageV1;
    var describeState = typeof opts.describeState === 'function'
      ? opts.describeState : ingestion.describeSavedChatArchiveStateV1;
    var inspectPackage = typeof opts.inspectPackage === 'function'
      ? opts.inspectPackage : inspector.inspectPackage;
    var entryPresentation = typeof opts.entryPresentation === 'function'
      ? opts.entryPresentation
      : safeObject(ingestion.savedChatArchivePresentationV1).entryPresentation;

    var capable = (opts.capable !== undefined)
      ? opts.capable === true
      : (detectTauri()
        && typeof readIntegrity === 'function'
        && typeof partitionOccupants === 'function'
        && typeof describeCoverage === 'function'
        && typeof inspectPackage === 'function'
        && typeof entryPresentation === 'function');

    var state = {
      phase: 'idle',
      error: '',
      complete: null,
      chats: [],
      selectedChatId: '',
      coverage: null,
      chatState: null,
      sections: [],
      chatPhase: 'idle',
      selectedPackagePath: '',
      inspection: null,
      versionPhase: 'idle',
    };

    container.textContent = '';
    var card = global.document.createElement('section');
    card.setAttribute('data-h2o-card', 'saved-chat-recovery-center');
    container.appendChild(card);

    var head = el('div', null, 'display:flex;align-items:center;gap:12px;justify-content:space-between');
    head.appendChild(el('h3', TEXT.title, 'margin:0'));
    var refresh = el('button', TEXT.refreshButton);
    refresh.setAttribute('type', 'button');
    refresh.setAttribute('data-h2o-action', 'recovery-center-refresh');
    head.appendChild(refresh);
    card.appendChild(head);
    card.appendChild(el('div', TEXT.readOnlyNote, 'opacity:.7;font-size:12px;margin:4px 0 10px'));

    var noticeBox = el('div', null, 'margin:0 0 10px');
    card.appendChild(noticeBox);
    var chooserBox = el('div', null, 'display:flex;align-items:center;gap:8px;margin:0 0 10px');
    card.appendChild(chooserBox);
    var timelineBox = el('div');
    card.appendChild(timelineBox);
    var detailBox = el('div', null, 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)');
    card.appendChild(detailBox);

    function pill(label) {
      return el('span', label,
        'display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(240,180,60,.16);color:#f0b43c');
    }

    function renderNotices() {
      noticeBox.textContent = '';
      if (state.complete === false) {
        var warn = el('div', null, 'display:flex;align-items:center;gap:8px;flex-wrap:wrap');
        warn.appendChild(pill(TEXT.partialPill));
        warn.appendChild(el('span', TEXT.partialHeadline, 'font-weight:600'));
        noticeBox.appendChild(warn);
        noticeBox.appendChild(el('div', TEXT.partialNote, 'opacity:.8;font-size:12px;margin-top:4px'));
      }
      var cs = safeObject(state.chatState);
      if (state.selectedChatId) {
        if (cleanString(cs.discoveryNote)) {
          noticeBox.appendChild(el('div', cs.discoveryNote, 'opacity:.8;font-size:12px;margin-top:4px'));
        }
        if (cleanString(cs.projectionNote)) {
          noticeBox.appendChild(el('div', cs.projectionNote, 'opacity:.8;font-size:12px;margin-top:4px'));
        }
        if (cleanString(cs.preservedLabel) || cleanString(cs.coverageLabel)) {
          noticeBox.appendChild(el('div',
            cleanString(cs.preservedLabel) + ' · ' + cleanString(cs.coverageLabel),
            'font-size:12px;margin-top:6px'));
        }
      }
    }

    function renderChooser() {
      chooserBox.textContent = '';
      if (!state.chats.length) return;
      var label = el('label', TEXT.chatLabel, 'font-size:12px;opacity:.8');
      label.setAttribute('for', 'h2oRecoveryCenterChat');
      var select = global.document.createElement('select');
      select.id = 'h2oRecoveryCenterChat';
      select.setAttribute('data-h2o-control', 'recovery-center-chat');
      var placeholder = global.document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = TEXT.chatPlaceholder;
      select.appendChild(placeholder);
      state.chats.forEach(function (chat) {
        var option = global.document.createElement('option');
        /* Unattributed packages carry no proven chat identity, so there is
         * nothing to ask coverage about; the group is listed, not selectable. */
        option.value = chat.attributed ? chat.chatId : '';
        option.disabled = !chat.attributed;
        option.textContent = chat.label + ' (' + chat.packageCount + ')';
        if (chat.attributed && chat.chatId === state.selectedChatId) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', function () { selectChat(select.value); });
      chooserBox.appendChild(label);
      chooserBox.appendChild(select);
    }

    function renderTimeline() {
      timelineBox.textContent = '';
      if (state.phase === 'ready' && !state.chats.length) {
        timelineBox.appendChild(el('div', TEXT.empty));
        timelineBox.appendChild(el('div', TEXT.emptyHint, 'opacity:.7;font-size:12px'));
        return;
      }
      if (!state.selectedChatId) return;
      if (state.chatPhase === 'loading') { timelineBox.appendChild(el('div', TEXT.loadingChat)); return; }
      if (state.chatPhase === 'error') { timelineBox.appendChild(el('div', TEXT.error)); return; }
      if (!state.sections.length) { timelineBox.appendChild(el('div', TEXT.noVersions)); return; }

      state.sections.forEach(function (section) {
        var group = el('div', null, 'margin:10px 0 0');
        group.setAttribute('data-h2o-section', section.key);
        group.appendChild(el('div', section.title, 'font-weight:600;font-size:13px'));
        if (section.note) group.appendChild(el('div', section.note, 'opacity:.75;font-size:12px;margin-bottom:4px'));
        section.rows.forEach(function (row) {
          group.appendChild(renderRow(row));
        });
        timelineBox.appendChild(group);
      });
    }

    function renderRow(row) {
      var selected = row.selectable && row.packagePath === state.selectedPackagePath;
      var line = global.document.createElement(row.selectable ? 'button' : 'div');
      if (row.selectable) {
        line.setAttribute('type', 'button');
        line.setAttribute('data-h2o-action', 'recovery-center-select-version');
        line.addEventListener('click', function () { selectVersion(row.packagePath); });
      }
      line.setAttribute('data-h2o-row', 'recovery-center-version');
      line.setAttribute('data-h2o-selectable', row.selectable ? '1' : '0');
      if (selected) line.setAttribute('data-h2o-selected', '1');
      line.setAttribute('style', 'display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;border-radius:8px;'
        + 'border:1px solid rgba(255,255,255,' + (selected ? '.30' : '.10') + ');'
        + 'background:rgba(255,255,255,' + (selected ? '.06' : '.02') + ');'
        + 'color:inherit;font:inherit;'
        + (row.selectable ? 'cursor:pointer' : 'cursor:default;opacity:.75'));

      var top = el('div', null, 'display:flex;gap:8px;flex-wrap:wrap;align-items:baseline');
      top.appendChild(el('span', row.kindLabel, 'font-weight:600;font-size:13px'));
      top.appendChild(el('span', row.freshnessLabel, 'font-size:12px;opacity:.85'));
      if (row.savedAt) top.appendChild(el('span', row.savedAt, 'font-size:12px;opacity:.6'));
      line.appendChild(top);
      line.appendChild(el('div', row.packageDirName, 'font-size:11px;opacity:.6;word-break:break-all'));
      if (row.blockers.length) {
        line.appendChild(el('div', TEXT.blockersHeading + ': ' + row.blockers.join(', '),
          'font-size:11px;opacity:.8;margin-top:2px'));
      }
      return line;
    }

    function renderDetail() {
      detailBox.textContent = '';
      detailBox.appendChild(el('div', TEXT.detailHeading, 'font-weight:600;font-size:13px'));
      if (!state.selectedPackagePath) { detailBox.appendChild(el('div', TEXT.detailIdle, 'opacity:.75;font-size:12px')); return; }
      if (state.versionPhase === 'loading') { detailBox.appendChild(el('div', TEXT.loadingVersion)); return; }
      var ins = safeObject(state.inspection);
      if (state.versionPhase === 'error' || !cleanString(ins.status)) {
        detailBox.appendChild(el('div', TEXT.detailUnavailable, 'opacity:.85;font-size:12px'));
        return;
      }
      var identity = safeObject(ins.identity);
      var list = el('div', null, 'font-size:12px;display:grid;gap:2px;margin-top:4px');
      function pair(key, value) {
        if (!cleanString(value) && value !== 0) return;
        list.appendChild(el('div', key + ': ' + value, 'word-break:break-all'));
      }
      pair('Status', ins.status);
      pair('Package', ins.packageDirName);
      if (cleanString(identity.title)) pair('Title', identity.title);
      pair('Chat', identity.chatId);
      pair('Snapshot', identity.snapshotId);
      pair('Verified contentHash', identity.contentHash);
      if (identity.schemaVersion !== null && identity.schemaVersion !== undefined) pair('Format', 'v' + identity.schemaVersion);
      if (identity.messageCount !== null && identity.messageCount !== undefined) pair('Messages', String(identity.messageCount));
      detailBox.appendChild(list);
      if (asArray(ins.blockers).length) {
        detailBox.appendChild(el('div', TEXT.blockersHeading + ': ' + asArray(ins.blockers).join(', '),
          'font-size:12px;opacity:.85;margin-top:6px'));
      }
      if (safeObject(ins.checks).archiveEnumerationComplete === false) {
        detailBox.appendChild(el('div', TEXT.partialNote, 'font-size:12px;opacity:.8;margin-top:6px'));
      }
    }

    function render() {
      if (!capable) {
        card.textContent = '';
        card.appendChild(el('h3', TEXT.title, 'margin:0'));
        card.appendChild(el('div', TEXT.unavailable, 'margin-top:6px'));
        return;
      }
      refresh.disabled = state.phase === 'loading';
      if (state.phase === 'loading') {
        noticeBox.textContent = ''; chooserBox.textContent = '';
        timelineBox.textContent = ''; detailBox.textContent = '';
        timelineBox.appendChild(el('div', TEXT.loading));
        return;
      }
      if (state.phase === 'error') {
        noticeBox.textContent = ''; chooserBox.textContent = '';
        timelineBox.textContent = ''; detailBox.textContent = '';
        timelineBox.appendChild(el('div', TEXT.error + (state.error ? ' ' + state.error : '')));
        return;
      }
      renderNotices();
      renderChooser();
      renderTimeline();
      renderDetail();
    }

    /* ONE trusted read per open/refresh. Rows never trigger their own. */
    function load() {
      if (!capable) { render(); return Promise.resolve(); }
      state.phase = 'loading';
      state.error = '';
      render();
      return Promise.resolve()
        .then(function () { return readIntegrity(); })
        .then(function (envelope) {
          var env = safeObject(envelope);
          /* Completeness is the trusted envelope's own statement. A missing
           * flag is treated as incomplete rather than assumed complete. */
          state.complete = env.complete === true;
          var partition = safeObject(partitionOccupants(env.occupants));
          state.chats = buildChatIndex(partition.packageOccupants);
          state.phase = 'ready';
          /* A refresh must not leave a selection pointing at something the new
           * evidence no longer contains. */
          var stillPresent = state.chats.some(function (chat) {
            return chat.attributed && chat.chatId === state.selectedChatId;
          });
          if (!stillPresent) {
            state.selectedChatId = '';
            clearChat();
            render();
            return null;
          }
          return loadChat(state.selectedChatId);
        })
        .catch(function (err) {
          state.phase = 'error';
          state.error = cleanString(String((err && err.message) || err || ''));
          state.complete = null;
          state.chats = [];
          state.selectedChatId = '';
          clearChat();
          render();
        });
    }

    function clearChat() {
      state.coverage = null;
      state.chatState = null;
      state.sections = [];
      state.chatPhase = 'idle';
      clearVersion();
    }

    function clearVersion() {
      state.selectedPackagePath = '';
      state.inspection = null;
      state.versionPhase = 'idle';
    }

    /* One coverage call per chat selection — never one per row. */
    function loadChat(chatId) {
      var id = cleanString(chatId);
      if (!id) { clearChat(); render(); return Promise.resolve(); }
      state.chatPhase = 'loading';
      clearVersion();
      render();
      return Promise.resolve()
        .then(function () { return describeCoverage({ chatId: id }); })
        .then(function (coverage) {
          /* A slower response for a chat the operator has since left must never
           * overwrite the current one. */
          if (cleanString(state.selectedChatId) !== id) return;
          state.coverage = safeObject(coverage);
          state.chatState = (typeof describeState === 'function')
            ? safeObject(describeState(state.coverage)) : null;
          state.sections = buildTimelineSections(state.coverage, entryPresentation);
          state.chatPhase = 'ready';
          render();
        })
        .catch(function () {
          if (cleanString(state.selectedChatId) !== id) return;
          state.chatPhase = 'error';
          state.sections = [];
          render();
        });
    }

    function selectChat(chatId) {
      var id = cleanString(chatId);
      if (id === state.selectedChatId) return Promise.resolve();
      state.selectedChatId = id;
      return loadChat(id);
    }

    /* One inspection per version selection — never one per row. */
    function selectVersion(packagePath) {
      var path = cleanString(packagePath);
      var row = null;
      allRowsOf(state.sections).forEach(function (candidate) {
        if (!row && candidate.packagePath === path) row = candidate;
      });
      /* Selection identity is the trusted row's own archive-relative path. An
       * unknown, unscoped or non-selectable target is refused outright. */
      if (!row || !row.selectable) return Promise.resolve();
      state.selectedPackagePath = path;
      state.inspection = null;
      state.versionPhase = 'loading';
      render();
      return Promise.resolve()
        .then(function () { return inspectPackage({ packagePath: path }); })
        .then(function (result) {
          if (state.selectedPackagePath !== path) return;
          state.inspection = safeObject(result);
          state.versionPhase = 'ready';
          render();
        })
        .catch(function () {
          if (state.selectedPackagePath !== path) return;
          state.versionPhase = 'error';
          render();
        });
    }

    refresh.addEventListener('click', function () { load(); });

    render();
    if (capable && opts.autoLoad !== false) load();

    return {
      getState: function () { return state; },
      load: load,
      selectChat: selectChat,
      selectVersion: selectVersion,
    };
  }

  /* Mount as a SIBLING below the read-only Archive Health card, so a health
   * re-render never wipes it. Idempotent: the stable mount owns exactly one
   * card and one set of listeners even if Settings re-enters. */
  function mountRecoveryCenterCard(healthContainer, options) {
    if (!healthContainer || !global.document) return null;
    var container = healthContainer;
    var parent = healthContainer.parentNode;
    if (parent && typeof parent.appendChild === 'function') {
      var mount = (typeof parent.querySelector === 'function')
        ? parent.querySelector('[data-h2o-recovery-center-mount="1"]') : null;
      if (!mount) {
        mount = global.document.createElement('div');
        mount.setAttribute('data-h2o-recovery-center-mount', '1');
        mount.style.marginTop = '12px';
        parent.appendChild(mount);
      }
      mount.textContent = '';
      container = mount;
    }
    return renderRecoveryCenterCard(container, options || {});
  }

  H2O.Studio.recoveryCenterUi = {
    __installed: true,
    __version: MODULE_VERSION,
    TEXT: TEXT,
    buildChatIndex: buildChatIndex,
    buildTimelineSections: buildTimelineSections,
    renderRecoveryCenterCard: renderRecoveryCenterCard,
    mountRecoveryCenterCard: mountRecoveryCenterCard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
