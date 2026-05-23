/* H2O Studio Diagnostics - Multi-Peer Diff Analyzer (F1A)
 *
 * PURE ANALYZER - read-only, in-memory, no IO.
 *   - No Tauri invokes, no chrome.storage, no IndexedDB, no fetch, no fs.
 *   - analyze() is fully synchronous; no await, no Promises.
 *   - No global mutation except namespace registration at load.
 *   - No persistent writes anywhere.
 *   - Not part of the userscript pack; loaded by hand into DevTools.
 *
 * SCOPE: F1A returns a structured diagnostic report describing what a future
 *   multi-peer engine would observe given (a) a fullBundle v2 envelope and
 *   (b) an optional local-state snapshot. F1A does not write, does not
 *   change schemas, does not modify the R1-R2E sync lane.
 *
 * USAGE in DevTools:
 *   const bundle     = await H2O.Studio.ingestion.exportFullBundle();
 *   const localState = await H2O.Studio.diagnostics.collectLocalState(); // optional
 *   const report     = H2O.Studio.diagnostics.multiPeerDiff({ bundle, localState });
 *   console.log(JSON.stringify(report, null, 2));
 *
 * SEPARATION:
 *   - multiPeerDiff(input)  - pure synchronous analyzer (this file's core).
 *   - collectLocalState()   - optional async helper that calls store .list()
 *                              adapters; read-only only; analyzer does NOT
 *                              depend on it.
 *
 * MERGE-RULE CLASSIFIER (F1A-approved table):
 *   merge:union            - tagIds, labelIds, FolderBinding sets, multi-head snapshots
 *   merge:visual-lww       - color, icon, position, view preference
 *   conflict:needs-review  - title, href, state.isSaved/isLinked/isPinned/isArchived,
 *                            categoryId, projectId, folder hierarchy, renames
 *   conflict:hard          - same snapshotId / different digest; saved-snapshot
 *                            content fields disagreeing; delete-vs-edit
 *
 * PEER MODEL (F1A-approved correction):
 *   A producer is a SYNC PEER only if it owns a durable Library store and
 *   produces its own per-peer export. Native content-script origins
 *   (chatgpt/claude/gemini) feed an owning peer's store and are classified
 *   as CAPTURE SOURCES attached to that peer, NOT separate peers.
 *
 * FIELD ALLOWLIST (what the analyzer is permitted to read from records):
 *   IDs, ISO timestamps, digests, counts, source-attribution strings,
 *   scalar metadata (title/href, truncated for samples), state.* booleans,
 *   foreign-key id strings, tagIds[]/labelIds[] arrays, folder/category
 *   hierarchy ids, color/icon/position scalars.
 *
 *   The analyzer MUST NOT read snapshot.messages, message bodies, or any
 *   transcript content. Samples carry IDs and short scalars only.
 *
 * DELIBERATELY OUT OF SCOPE FOR F1A:
 *   - Settings UI of any kind
 *   - Runtime feature flags
 *   - Persisting reports
 *   - Wiring into existing R-phase sync diagnostics
 *   - Tombstone propagation or identity scaffolding
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__multiPeerDiffInstalled) return;

  /* ─────────────────────────────────────────────────────────────────────
   * Constants
   * ──────────────────────────────────────────────────────────────────── */

  var REPORT_SCHEMA = 'h2o.studio.diagnostics.multi-peer-diff.v1';
  var EXPECTED_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2';
  var EXPECTED_CHAT_ARCHIVE_SCHEMA = 'h2o.chatArchive.bundle.v1';
  var EXPECTED_TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var CONFLICT_CANDIDATE_SCHEMA = 'h2o.studio.sync-conflict-candidate.v1';
  var DEFAULT_MAX_SAMPLES = 25;
  var DEFAULT_MAX_CONFLICT_CANDIDATES = 20;
  var SAMPLE_SCALAR_MAX_LEN = 80;
  var KINDS = ['chat', 'snapshot', 'folder', 'category', 'label', 'tag', 'project', 'folderBinding'];
  var TOMBSTONE_KINDS = [
    'chat',
    'snapshot',
    'folder',
    'folderBinding',
    'tag',
    'tagBinding',
    'label',
    'labelBinding',
    'category',
    'project',
    'visualMetadata',
    'linkedOnlyChat',
    'savedSnapshot'
  ];
  var BINDING_TOMBSTONE_KINDS = ['folderBinding', 'tagBinding', 'labelBinding'];
  var REQUIRED_TOMBSTONE_FIELDS = [
    'schema',
    'tombstoneId',
    'recordKind',
    'recordId',
    'deletedAt',
    'deletedBySyncPeerId',
    'deleteReason'
  ];
  var NATIVE_HOST_PATTERN = /(chatgpt|openai\.com|claude\.ai|anthropic|gemini|bard|google\.com)/i;

  /* Field-to-bucket map for the conflict classifier. */
  var FIELD_BUCKETS = {
    title:                'conflict:needs-review',
    href:                 'conflict:needs-review',
    'state.isSaved':      'conflict:needs-review',
    'state.isLinked':     'conflict:needs-review',
    'state.isPinned':     'conflict:needs-review',
    'state.isArchived':   'conflict:needs-review',
    categoryId:           'conflict:needs-review',
    projectId:            'conflict:needs-review',
    parentId:             'conflict:needs-review',
    name:                 'conflict:needs-review',
    color:                'merge:visual-lww',
    icon:                 'merge:visual-lww',
    position:             'merge:visual-lww',
    sortPreference:       'merge:visual-lww',
    viewPreference:       'merge:visual-lww',
    tagIds:               'merge:union',
    labelIds:             'merge:union'
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Tiny helpers (all pure)
   * ──────────────────────────────────────────────────────────────────── */

  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function safeObject(v) { return isObject(v) ? v : {}; }
  function safeString(v) { return v == null ? '' : String(v); }
  function trimScalar(v) {
    var s = safeString(v);
    if (s.length <= SAMPLE_SCALAR_MAX_LEN) return s;
    return s.slice(0, SAMPLE_SCALAR_MAX_LEN) + '…';
  }
  function isIsoLike(v) {
    if (v == null) return false;
    var s = safeString(v);
    if (!s) return false;
    /* Accept ISO-8601 or epoch-ms; both are seen in current shapes. */
    return /^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{10,}$/.test(s);
  }
  function parseTimeMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = safeString(v);
    if (!s) return null;
    if (/^\d{10,}$/.test(s)) {
      var n = Number(s);
      return isFinite(n) ? n : null;
    }
    var ms = Date.parse(s);
    return isNaN(ms) ? null : ms;
  }
  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }
  function pushSample(arr, item, cap) {
    if (arr.length < cap) arr.push(item);
  }
  function getPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!isObject(cur) && !Array.isArray(cur)) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function deepEqualScalar(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      var sa = a.slice().sort();
      var sb = b.slice().sort();
      for (var i = 0; i < sa.length; i++) {
        if (safeString(sa[i]) !== safeString(sb[i])) return false;
      }
      return true;
    }
    return safeString(a) === safeString(b);
  }
  function bumpCounter(obj, key, amount) {
    var k = safeString(key) || 'unknown';
    obj[k] = (Number(obj[k] || 0) + (amount == null ? 1 : Number(amount)));
  }
  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(Object(obj), key);
  }
  function hasNonEmptyField(obj, key) {
    return hasOwn(obj, key) && safeString(obj[key]) !== '';
  }
  function knownTombstoneKind(kind) {
    return TOMBSTONE_KINDS.indexOf(kind) !== -1;
  }
  function isBindingTombstoneKind(kind) {
    return BINDING_TOMBSTONE_KINDS.indexOf(kind) !== -1;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * Record extraction (defensive against shape drift)
   *
   * The analyzer reads only the field allowlist documented in the header.
   * Snapshot.messages and any transcript content are never read.
   * ──────────────────────────────────────────────────────────────────── */

  function extractChats(bundle) {
    /* The real wire shape nests chat metadata under `chatIndex` (observed on
     * `~/H2O Studio Sync/latest.json` from the Desktop exporter). We probe
     * top-level first, then fall through to `chatIndex.*` so the analyzer
     * reports against actual wire data, not a hypothetical top-level shape. */
    var archive = safeObject(safeObject(bundle).chatArchive);
    var chats = asArray(archive.chats);
    var out = [];
    for (var i = 0; i < chats.length; i++) {
      var c = safeObject(chats[i]);
      var idx = safeObject(c.chatIndex);
      var state = safeObject(c.state);
      var idxState = safeObject(idx.state);
      out.push({
        chatId:      safeString(c.chatId || c.id),
        title:       safeString(c.title || idx.title),
        href:        safeString(c.href || c.url || idx.href || idx.linkSourceHref),
        createdAt:   c.createdAt || c.created_at || idx.linkedAt,
        updatedAt:   c.updatedAt || c.updated_at || idx.lastCapturedAt,
        linkedAt:       idx.linkedAt,
        lastCapturedAt: idx.lastCapturedAt,
        lastDigest:     safeString(idx.lastDigest),
        lastSnapshotId: safeString(idx.lastSnapshotId),
        source:      safeString(c.source),
        host:        safeString(c.host || c.captureHost || c.origin || safeObject(c.meta).host),
        captureSource: safeString(c.captureSource || safeObject(c.meta).captureSource),
        state: {
          isLinked:   !!(state.isLinked   || idxState.isLinked),
          isSaved:    !!(state.isSaved    || idxState.isSaved),
          isPinned:   !!(state.isPinned   || idxState.isPinned),
          isArchived: !!(state.isArchived || idxState.isArchived),
          isDeleted:  !!(state.isDeleted  || idxState.isDeleted)
        },
        categoryId:  safeString(c.categoryId),
        projectId:   safeString(c.projectId),
        tagIds:      asArray(c.tagIds).map(safeString),
        labelIds:    asArray(c.labelIds).map(safeString),
        snapshotCount: asArray(c.snapshots).length,
        snapshotIds: asArray(c.snapshots).map(function (s) { return safeString(safeObject(s).snapshotId || safeObject(s).id); })
      });
    }
    return out;
  }

  function extractSnapshots(bundle) {
    var archive = safeObject(safeObject(bundle).chatArchive);
    var chats = asArray(archive.chats);
    var out = [];
    for (var i = 0; i < chats.length; i++) {
      var chatId = safeString(safeObject(chats[i]).chatId || safeObject(chats[i]).id);
      var snaps = asArray(safeObject(chats[i]).snapshots);
      for (var j = 0; j < snaps.length; j++) {
        var s = safeObject(snaps[j]);
        var meta = safeObject(s.meta);
        out.push({
          snapshotId:   safeString(s.snapshotId || s.id),
          chatId:       chatId,
          capturedAt:   s.capturedAt || s.createdAt,
          updatedAt:    s.updatedAt,
          digest:       safeString(s.digest),
          messageCount: s.messageCount == null ? null : Number(s.messageCount),
          schema:       safeString(s.schema),
          source:       safeString(s.source || meta.source),
          host:         safeString(meta.host || meta.captureHost || s.host)
        });
      }
    }
    return out;
  }

  function extractCatalog(bundle, name) {
    var archive = safeObject(safeObject(bundle).chatArchive);
    var catalogs = safeObject(archive.catalogs);
    var rows = asArray(catalogs[name]);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = safeObject(rows[i]);
      out.push({
        id:          safeString(r.id || r.categoryId || r.labelId || r.tagId),
        name:        safeString(r.name || r.label || r.title),
        createdAt:   r.createdAt,
        updatedAt:   r.updatedAt,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt:  r.lastSeenAt,
        color:       safeString(r.color),
        icon:        safeString(r.icon),
        position:    r.position == null ? null : Number(r.position),
        parentId:    safeString(r.parentId),
        source:      safeString(r.source),
        recordSchemaVersion: r.recordSchemaVersion == null ? null : Number(r.recordSchemaVersion)
      });
    }
    return out;
  }

  function extractFolders(bundle) {
    /* Folders live in chromeStorageLocal['h2o:prm:cgx:fldrs:state:data:v1']
     * on a Desktop-produced bundle. Defensive: also accept chatArchive.catalogs.folders. */
    var archive = safeObject(safeObject(bundle).chatArchive);
    var catalogFolders = asArray(safeObject(archive.catalogs).folders);
    if (catalogFolders.length) {
      return catalogFolders.map(function (r) {
        var row = safeObject(r);
        return {
          id:        safeString(row.id || row.folderId),
          name:      safeString(row.name || row.title),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          parentId:  safeString(row.parentId),
          position:  row.position == null ? null : Number(row.position),
          color:     safeString(row.color),
          icon:      safeString(row.icon),
          isArchived: !!row.isArchived,
          source:    safeString(row.source),
          recordSchemaVersion: row.recordSchemaVersion == null ? null : Number(row.recordSchemaVersion)
        };
      });
    }
    var csl = safeObject(safeObject(bundle).chromeStorageLocal);
    var folderState = safeObject(csl['h2o:prm:cgx:fldrs:state:data:v1']);
    var rows = asArray(folderState.folders);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = safeObject(rows[i]);
      out.push({
        id:        safeString(r.id || r.folderId),
        name:      safeString(r.name || r.title),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        parentId:  safeString(r.parentId),
        position:  r.position == null ? null : Number(r.position),
        color:     safeString(r.color),
        icon:      safeString(r.icon),
        isArchived: !!r.isArchived,
        source:    safeString(r.source),
        recordSchemaVersion: r.recordSchemaVersion == null ? null : Number(r.recordSchemaVersion)
      });
    }
    return out;
  }

  function extractByKind(bundle, kind) {
    if (kind === 'chat')     return extractChats(bundle);
    if (kind === 'snapshot') return extractSnapshots(bundle);
    if (kind === 'folder')   return extractFolders(bundle);
    if (kind === 'category') return extractCatalog(bundle, 'categories');
    if (kind === 'label')    return extractCatalog(bundle, 'labels');
    if (kind === 'tag')      return extractCatalog(bundle, 'tags');
    if (kind === 'project')  return extractCatalog(bundle, 'projects');
    if (kind === 'folderBinding') {
      var csl = safeObject(safeObject(bundle).chromeStorageLocal);
      var fs = safeObject(csl['h2o:prm:cgx:fldrs:state:data:v1']);
      return asArray(fs.bindings).map(function (b) {
        var row = safeObject(b);
        return {
          id:        safeString(row.chatId) + '|' + safeString(row.folderId),
          chatId:    safeString(row.chatId),
          folderId:  safeString(row.folderId),
          boundAt:   row.boundAt,
          updatedAt: row.updatedAt,
          position:  row.position == null ? null : Number(row.position),
          pinned:    !!row.pinned,
          source:    safeString(row.source)
        };
      });
    }
    return [];
  }

  function normalizeLocalState(localState) {
    if (!isObject(localState)) return null;
    var norm = {};
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      var key = k === 'category' ? 'categories'
              : k === 'label'    ? 'labels'
              : k === 'tag'      ? 'tags'
              : k === 'folder'   ? 'folders'
              : k === 'project'  ? 'projects'
              : k === 'snapshot' ? 'snapshots'
              : k === 'folderBinding' ? 'folderBindings'
              : 'chats';
      norm[k] = asArray(localState[key]).map(function (r) {
        var row = safeObject(r);
        var state = safeObject(row.state);
        var chatId = safeString(row.chatId || row.chat_id);
        var folderId = safeString(row.folderId || row.folder_id);
        var genericId = safeString(row.id || row.chatId || row.snapshotId || row.folderId || row.categoryId || row.labelId || row.tagId || row.projectId);
        var id = k === 'folderBinding' && chatId && folderId
          ? chatId + '|' + folderId
          : genericId;
        return {
          id:        id,
          chatId:    chatId,
          folderId:  folderId,
          title:     safeString(row.title || row.name),
          name:      safeString(row.name),
          href:      safeString(row.href || row.url),
          createdAt: row.createdAt || row.created_at,
          updatedAt: row.updatedAt || row.updated_at,
          capturedAt: row.capturedAt,
          digest:    safeString(row.digest),
          parentId:  safeString(row.parentId),
          color:     safeString(row.color),
          icon:      safeString(row.icon),
          position:  row.position == null ? null : Number(row.position),
          source:    safeString(row.source),
          host:      safeString(row.host || row.captureHost || safeObject(row.meta).host),
          captureSource: safeString(row.captureSource || safeObject(row.meta).captureSource),
          messageCount: row.messageCount == null ? null : Number(row.messageCount),
          tagIds:    asArray(row.tagIds).map(safeString),
          labelIds:  asArray(row.labelIds).map(safeString),
          categoryId: safeString(row.categoryId),
          projectId:  safeString(row.projectId),
          /* F1B.3: localState state flags can live either nested
           * (row.state.{isLinked,...}) or as top-level boolean columns
           * (row.isLinked / row.is_linked) depending on the store adapter.
           * SQLite-backed adapters expose them top-level; older callers
           * pass a nested state object. Read from BOTH shapes so the
           * conflict comparator does not flag wire-vs-local shape
           * differences as needs-review noise. */
          state: {
            isLinked:   !!(state.isLinked   || row.isLinked   || row.is_linked),
            isSaved:    !!(state.isSaved    || row.isSaved    || row.is_saved),
            isPinned:   !!(state.isPinned   || row.isPinned   || row.is_pinned),
            isArchived: !!(state.isArchived || row.isArchived || row.is_archived),
            isDeleted:  !!(state.isDeleted  || row.isDeleted  || row.is_deleted)
          }
        };
      });
    }
    return norm;
  }

  function indexById(rows) {
    var map = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var id = safeString(rows[i].id || rows[i].chatId || rows[i].snapshotId);
      if (id) map[id] = rows[i];
    }
    return map;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * Report builders
   * ──────────────────────────────────────────────────────────────────── */

  function buildInputSummary(bundle, localState) {
    var b = safeObject(bundle);
    var archive = safeObject(b.chatArchive);
    var s = safeObject(b.summary);
    return {
      bundleSchema:        safeString(b.schema),
      bundleSchemaExpected: EXPECTED_BUNDLE_SCHEMA,
      bundleSchemaMatches:  safeString(b.schema) === EXPECTED_BUNDLE_SCHEMA,
      chatArchiveSchema:        safeString(archive.schema),
      chatArchiveSchemaExpected: EXPECTED_CHAT_ARCHIVE_SCHEMA,
      chatArchiveSchemaMatches:  safeString(archive.schema) === EXPECTED_CHAT_ARCHIVE_SCHEMA,
      bundleExportedAt:    b.exportedAt || null,
      bundleSurface:       safeString(b.exportedFromSurface),
      bundleExtensionId:   safeString(b.exportedFromExtensionId),
      bundleExtensionName: safeString(b.exportedFromExtensionName),
      bundleVersion:       safeString(b.exportedFromVersion),
      counts: {
        chats:           Number(s.chatCount || 0),
        snapshots:       Number(s.snapshotCount || 0),
        turns:           Number(s.turnCount || 0),
        folders:         Number(s.folderCount || 0),
        folderBindings:  Number(s.folderBindingCount || 0),
        categories:      Number(s.categoryCount || 0),
        labels:          Number(s.labelCount || 0),
        linkedOnly:      Number(s.linkedOnlyCount || 0)
      },
      localProvided: !!localState,
      hasChromeStorageLocal: !!b.chromeStorageLocal,
      hasLibraryKv:          Array.isArray(b.libraryKv) && b.libraryKv.length > 0
    };
  }

  function emptyConflictCandidateReport(maxCandidates) {
    return {
      supported: true,
      generatedAt: nowIso(),
      redacted: true,
      total: 0,
      byKind: {},
      byEntityKind: {},
      byClassification: {},
      bySeverity: {},
      deleteVsEditReferenceCount: 0,
      unsupportedCount: 0,
      candidates: [],
      warnings: [],
      maxCandidates: maxCandidates
    };
  }

  function mapCandidateEntityKind(kind) {
    if (kind === 'chat' ||
        kind === 'snapshot' ||
        kind === 'folder' ||
        kind === 'folderBinding' ||
        kind === 'label' ||
        kind === 'category' ||
        kind === 'visualMetadata') {
      return kind;
    }
    return 'unknown';
  }

  function buildDedupePresenceInput(parts) {
    return asArray(parts).map(function (part) { return safeString(part); }).join('|');
  }

  function digestPresent(kind, row) {
    row = safeObject(row);
    if (kind === 'chat') return !!safeString(row.lastDigest || row.digest);
    if (kind === 'snapshot') return !!safeString(row.digest);
    return false;
  }

  function addConflictCandidate(report, seen, maxCandidates, descriptor) {
    descriptor = safeObject(descriptor);
    var conflictKind = safeString(descriptor.conflictKind) || 'unsupported-merge-kind';
    var entityKind = mapCandidateEntityKind(descriptor.entityKind);
    var classification = safeString(descriptor.classification) || 'needs-human-review';
    var severity = safeString(descriptor.severity) || 'medium';
    var dedupeInput = safeString(descriptor.dedupeInput || buildDedupePresenceInput([
      conflictKind,
      entityKind,
      descriptor.entityId,
      descriptor.localDigest,
      descriptor.remoteDigest,
      descriptor.localUpdatedAt,
      descriptor.remoteUpdatedAt
    ]));
    if (dedupeInput && seen[dedupeInput]) return;
    if (dedupeInput) seen[dedupeInput] = true;

    report.total++;
    bumpCounter(report.byKind, conflictKind);
    bumpCounter(report.byEntityKind, entityKind);
    bumpCounter(report.byClassification, classification);
    bumpCounter(report.bySeverity, severity);
    if (conflictKind === 'delete-vs-edit-reference') report.deleteVsEditReferenceCount++;
    if (conflictKind === 'unsupported-merge-kind' || classification === 'unsupported-record-kind') report.unsupportedCount++;

    if (report.candidates.length < maxCandidates) {
      report.candidates.push({
        schema: CONFLICT_CANDIDATE_SCHEMA,
        conflictKind: conflictKind,
        entityKind: entityKind,
        classification: classification,
        severity: severity,
        localUpdatedAtPresent: safeString(descriptor.localUpdatedAt) !== '',
        remoteUpdatedAtPresent: safeString(descriptor.remoteUpdatedAt) !== '',
        localDigestPresent: !!descriptor.localDigestPresent,
        remoteDigestPresent: !!descriptor.remoteDigestPresent,
        dedupeKeyHashPresent: true,
        source: 'multi-peer-diff',
        warnings: Array.isArray(descriptor.warnings) ? descriptor.warnings : []
      });
    }
  }

  function addFreshnessCandidate(report, seen, maxCandidates, kind, id, bundleRow, localRow) {
    var localUpdatedAt = safeObject(localRow).updatedAt || safeObject(localRow).lastSeenAt || safeObject(localRow).capturedAt;
    var remoteUpdatedAt = safeObject(bundleRow).updatedAt || safeObject(bundleRow).lastSeenAt || safeObject(bundleRow).capturedAt;
    var localMs = parseTimeMs(localUpdatedAt);
    var remoteMs = parseTimeMs(remoteUpdatedAt);
    if (localMs == null || remoteMs == null || localMs === remoteMs) return;
    addConflictCandidate(report, seen, maxCandidates, {
      conflictKind: localMs > remoteMs ? 'local-newer-than-remote' : 'remote-newer-than-local',
      entityKind: kind,
      classification: 'safe-review',
      severity: 'low',
      entityId: id,
      localUpdatedAt: localUpdatedAt,
      remoteUpdatedAt: remoteUpdatedAt,
      localDigestPresent: digestPresent(kind, localRow),
      remoteDigestPresent: digestPresent(kind, bundleRow),
      localDigest: safeObject(localRow).digest,
      remoteDigest: safeObject(bundleRow).digest || safeObject(bundleRow).lastDigest,
      dedupeInput: buildDedupePresenceInput([
        'freshness',
        kind,
        id,
        localMs > remoteMs ? 'local' : 'remote',
        localUpdatedAt,
        remoteUpdatedAt
      ])
    });
  }

  function addMetadataCandidate(report, seen, maxCandidates, kind, id, field, bundleRow, localRow) {
    if (kind === 'tag' || kind === 'project') {
      addConflictCandidate(report, seen, maxCandidates, {
        conflictKind: 'unsupported-merge-kind',
        entityKind: 'unknown',
        classification: 'unsupported-record-kind',
        severity: 'info',
        entityId: id,
        localUpdatedAt: safeObject(localRow).updatedAt,
        remoteUpdatedAt: safeObject(bundleRow).updatedAt,
        localDigestPresent: digestPresent(kind, localRow),
        remoteDigestPresent: digestPresent(kind, bundleRow),
        dedupeInput: buildDedupePresenceInput(['unsupported', kind, id, field])
      });
      return;
    }
    addConflictCandidate(report, seen, maxCandidates, {
      conflictKind: 'same-record-divergent-metadata',
      entityKind: kind,
      classification: 'needs-human-review',
      severity: 'medium',
      entityId: id,
      localUpdatedAt: safeObject(localRow).updatedAt,
      remoteUpdatedAt: safeObject(bundleRow).updatedAt,
      localDigestPresent: digestPresent(kind, localRow),
      remoteDigestPresent: digestPresent(kind, bundleRow),
      dedupeInput: buildDedupePresenceInput(['metadata', kind, id, field])
    });
  }

  function buildConflictCandidates(bundle, localState, maxCandidates) {
    var report = emptyConflictCandidateReport(maxCandidates);
    var seen = Object.create(null);
    if (!localState) {
      report.warnings.push({ code: 'local-state-required-for-conflict-candidates' });
      return report;
    }

    var bundleChats = extractChats(bundle);
    var localChats = asArray(localState.chat);
    var localChatById = indexById(localChats);
    var b;
    var l;
    var id;
    var i;
    var f;

    for (i = 0; i < bundleChats.length; i++) {
      b = bundleChats[i];
      id = b.chatId;
      if (!id) continue;
      l = localChatById[id];
      if (!l) continue;
      addFreshnessCandidate(report, seen, maxCandidates, 'chat', id, b, l);

      var chatFields = ['title', 'href', 'categoryId', 'projectId'];
      for (f = 0; f < chatFields.length; f++) {
        if (!deepEqualScalar(b[chatFields[f]], l[chatFields[f]])) {
          addMetadataCandidate(report, seen, maxCandidates, 'chat', id, chatFields[f], b, l);
        }
      }
      var stateKeys = ['isSaved', 'isLinked', 'isPinned', 'isArchived'];
      for (var si = 0; si < stateKeys.length; si++) {
        var sk = stateKeys[si];
        if (!!safeObject(b.state)[sk] !== !!safeObject(l.state)[sk]) {
          addMetadataCandidate(report, seen, maxCandidates, 'chat', id, 'state.' + sk, b, l);
        }
      }
      var localDeleted = !!safeObject(l.state).isDeleted;
      var bundleDeleted = !!safeObject(b.state).isDeleted;
      if (localDeleted !== bundleDeleted) {
        addConflictCandidate(report, seen, maxCandidates, {
          conflictKind: 'delete-vs-edit-reference',
          entityKind: 'chat',
          classification: 'delete-vs-edit-owned-by-f5',
          severity: 'critical',
          entityId: id,
          localUpdatedAt: l.updatedAt,
          remoteUpdatedAt: b.updatedAt,
          localDigestPresent: digestPresent('chat', l),
          remoteDigestPresent: digestPresent('chat', b),
          dedupeInput: buildDedupePresenceInput(['delete-vs-edit', 'chat', id, localDeleted, bundleDeleted])
        });
      }
    }

    var visualishKinds = ['folder', 'category', 'label', 'tag', 'project'];
    for (var vi = 0; vi < visualishKinds.length; vi++) {
      var kind = visualishKinds[vi];
      var bundleRows = extractByKind(bundle, kind);
      var localRows = asArray(localState[kind]);
      var localById = indexById(localRows);
      for (var bi = 0; bi < bundleRows.length; bi++) {
        b = bundleRows[bi];
        id = b.id;
        if (!id) continue;
        l = localById[id];
        if (!l) continue;
        if (kind === 'tag' || kind === 'project') {
          var unsupportedField = null;
          if (parseTimeMs(b.updatedAt) != null && parseTimeMs(l.updatedAt) != null && parseTimeMs(b.updatedAt) !== parseTimeMs(l.updatedAt)) {
            unsupportedField = 'updatedAt';
          } else if (!deepEqualScalar(b.name, l.name) && (b.name || l.name)) {
            unsupportedField = 'name';
          } else if (!deepEqualScalar(b.parentId, l.parentId)) {
            unsupportedField = 'parentId';
          }
          if (unsupportedField) {
            addMetadataCandidate(report, seen, maxCandidates, kind, id, unsupportedField, b, l);
          }
          continue;
        }
        addFreshnessCandidate(report, seen, maxCandidates, kind, id, b, l);
        var fields = ['name', 'parentId'];
        for (f = 0; f < fields.length; f++) {
          if (!deepEqualScalar(b[fields[f]], l[fields[f]]) && (b[fields[f]] || l[fields[f]])) {
            addMetadataCandidate(report, seen, maxCandidates, kind, id, fields[f], b, l);
          }
        }
      }
    }

    var bundleBindings = extractByKind(bundle, 'folderBinding');
    var localBindings = asArray(localState.folderBinding);
    if (bundleBindings.length && localBindings.length) {
      var bundleBindingById = indexById(bundleBindings);
      var localBindingById = indexById(localBindings);
      Object.keys(bundleBindingById).forEach(function (bindingId) {
        if (!localBindingById[bindingId]) {
          addConflictCandidate(report, seen, maxCandidates, {
            conflictKind: 'folder-membership-divergence',
            entityKind: 'folderBinding',
            classification: 'needs-human-review',
            severity: 'high',
            entityId: bindingId,
            dedupeInput: buildDedupePresenceInput(['folderBinding-missing-local', bindingId])
          });
        }
      });
      Object.keys(localBindingById).forEach(function (bindingId) {
        if (!bundleBindingById[bindingId]) {
          addConflictCandidate(report, seen, maxCandidates, {
            conflictKind: 'folder-membership-divergence',
            entityKind: 'folderBinding',
            classification: 'needs-human-review',
            severity: 'high',
            entityId: bindingId,
            dedupeInput: buildDedupePresenceInput(['folderBinding-missing-remote', bindingId])
          });
        }
      });
    } else if (bundleBindings.length && !localBindings.length) {
      report.warnings.push({ code: 'folder-binding-local-input-unavailable' });
    }

    var catalogs = safeObject(safeObject(safeObject(bundle).chatArchive).catalogs);
    Object.keys(catalogs).forEach(function (key) {
      if (['categories', 'labels', 'tags', 'projects', 'folders'].indexOf(key) !== -1) return;
      if (!Array.isArray(catalogs[key]) || catalogs[key].length === 0) return;
      addConflictCandidate(report, seen, maxCandidates, {
        conflictKind: 'unsupported-merge-kind',
        entityKind: 'unknown',
        classification: 'unsupported-record-kind',
        severity: 'info',
        dedupeInput: buildDedupePresenceInput(['unsupported-catalog', key, catalogs[key].length])
      });
    });

    return report;
  }

  function buildEnvelopeReport(bundle) {
    var b = safeObject(bundle);
    var notes = [];
    if (!('exportId' in b)) {
      notes.push('bundle.exportId is read by folder-import.mv3.js (stored as lastAppliedExportId) but never set by the current Desktop producer; current loop prevention relies on file SHA-256 + mtime + size.');
    }
    if (!('sequenceNumber' in b)) {
      notes.push('No per-peer sequenceNumber; multi-peer ordering cannot be inferred.');
    }
    if (!('sourceSyncPeerId' in b)) {
      notes.push('No sourceSyncPeerId; only exportedFromSurface / exportedFromExtensionId strings are present.');
    }
    if (!('contentSha256' in b)) {
      notes.push('No envelope-level contentSha256; checksum exists at the file level only (sidecar on the writer side, recomputed on the reader side).');
    }
    if (!Array.isArray(b.tombstones)) {
      notes.push('No tombstones[] array; deletion is by absence today.');
    }
    return {
      hasExportId:           'exportId' in b,
      hasSequenceNumber:     'sequenceNumber' in b,
      hasContentSha256:      'contentSha256' in b,
      hasSourceSyncPeerId:   'sourceSyncPeerId' in b,
      hasSourceInstallId:    'sourceInstallId' in b,
      hasSourcePhysicalDeviceId: 'sourcePhysicalDeviceId' in b,
      hasParentExportIds:    isObject(b.parentExportIds),
      hasPreviousExportId:   'previousExportId' in b,
      hasTombstoneArray:     Array.isArray(b.tombstones),
      hasRecordSchemaVersion: false, /* per-record; checked in coverage */
      notes: notes
    };
  }

  function emptyTombstonePayloadReport(bundle) {
    var b = safeObject(bundle);
    var missingRequiredFields = {};
    for (var i = 0; i < REQUIRED_TOMBSTONE_FIELDS.length; i++) {
      missingRequiredFields[REQUIRED_TOMBSTONE_FIELDS[i]] = 0;
    }
    return {
      supported: false,
      hasTombstoneArray: false,
      tombstoneSchemaVersion: safeString(b.tombstoneSchemaVersion),
      total: 0,
      active: 0,
      restored: 0,
      byKind: {},
      byDeleteReason: {},
      cascadeCount: 0,
      cascadeByKind: {},
      cascadeRootCount: 0,
      cascadeChildCount: 0,
      cascadeMissingParentRefCount: 0,
      malformedCount: 0,
      missingRequiredFields: missingRequiredFields,
      wrongSchemaCount: 0,
      unknownRecordKindCount: 0,
      metaPresentCount: 0,
      metaObjectCount: 0,
      metaMalformedCount: 0,
      inconsistentRestoreCount: 0,
      warnings: []
    };
  }

  function buildTombstonePayloadReport(bundle) {
    var b = safeObject(bundle);
    var report = emptyTombstonePayloadReport(b);

    if (!hasOwn(b, 'tombstones')) {
      report.warnings.push({ code: 'missing-tombstone-array' });
      return report;
    }
    if (!Array.isArray(b.tombstones)) {
      report.malformedCount = 1;
      report.warnings.push({ code: 'tombstones-not-array' });
      return report;
    }

    report.supported = true;
    report.hasTombstoneArray = true;
    report.total = b.tombstones.length;

    if (!report.tombstoneSchemaVersion) {
      report.warnings.push({ code: 'missing-tombstone-schema-version' });
    } else if (report.tombstoneSchemaVersion !== EXPECTED_TOMBSTONE_SCHEMA) {
      report.warnings.push({ code: 'unexpected-tombstone-schema-version' });
    }

    for (var i = 0; i < b.tombstones.length; i++) {
      var raw = b.tombstones[i];
      var rowIsObject = isObject(raw);
      var row = rowIsObject ? raw : {};
      var rowMalformed = !rowIsObject;
      var kind = safeString(row.recordKind);
      var deleteReason = safeString(row.deleteReason);

      for (var f = 0; f < REQUIRED_TOMBSTONE_FIELDS.length; f++) {
        var field = REQUIRED_TOMBSTONE_FIELDS[f];
        if (!hasNonEmptyField(row, field)) {
          report.missingRequiredFields[field]++;
          rowMalformed = true;
        }
      }

      if (hasNonEmptyField(row, 'schema') && safeString(row.schema) !== EXPECTED_TOMBSTONE_SCHEMA) {
        report.wrongSchemaCount++;
        rowMalformed = true;
      }

      if (kind) {
        bumpCounter(report.byKind, kind);
        if (!knownTombstoneKind(kind)) {
          report.unknownRecordKindCount++;
          rowMalformed = true;
        }
      } else {
        bumpCounter(report.byKind, 'missing');
      }

      bumpCounter(report.byDeleteReason, deleteReason || 'missing');

      var restoredAt = safeString(row.restoredAt);
      var restoredBy = safeString(row.restoredBySyncPeerId);
      var hasRestoredAt = restoredAt !== '';
      var hasRestoredBy = restoredBy !== '';
      if (hasRestoredAt || hasRestoredBy) {
        report.restored++;
        if (hasRestoredAt !== hasRestoredBy) {
          report.inconsistentRestoreCount++;
        }
      } else if (rowIsObject) {
        report.active++;
      }

      var metaPresent = hasOwn(row, 'meta') && row.meta != null;
      var metaObject = metaPresent && isObject(row.meta);
      if (metaPresent) {
        report.metaPresentCount++;
        if (metaObject) {
          report.metaObjectCount++;
        } else {
          report.metaMalformedCount++;
          rowMalformed = true;
        }
      }

      var cascadeFromPresent = safeString(row.cascadeFrom) !== '';
      var metaCascade = metaObject && row.meta.cascade === true;
      var metaCascadeKindPresent = metaObject && safeString(row.meta.cascadeKind) !== '';
      var deleteReasonCascade = /-cascade$/.test(deleteReason);
      var bindingCascade = metaCascade && isBindingTombstoneKind(kind);
      var cascadeChild = cascadeFromPresent || deleteReasonCascade || bindingCascade || metaCascadeKindPresent;
      var cascadeRoot = metaCascade && !cascadeChild;
      if (cascadeChild || cascadeRoot) {
        report.cascadeCount++;
        bumpCounter(report.cascadeByKind, kind || 'missing');
        if (cascadeChild) {
          report.cascadeChildCount++;
        } else {
          report.cascadeRootCount++;
        }
        if (cascadeChild && !cascadeFromPresent) {
          report.cascadeMissingParentRefCount++;
        }
      }

      if (rowMalformed) {
        report.malformedCount++;
      }
    }

    if (report.missingRequiredFields.schema ||
        report.missingRequiredFields.tombstoneId ||
        report.missingRequiredFields.recordKind ||
        report.missingRequiredFields.recordId ||
        report.missingRequiredFields.deletedAt ||
        report.missingRequiredFields.deletedBySyncPeerId ||
        report.missingRequiredFields.deleteReason) {
      report.warnings.push({ code: 'missing-required-tombstone-fields' });
    }
    if (report.wrongSchemaCount) report.warnings.push({ code: 'wrong-tombstone-schema' });
    if (report.unknownRecordKindCount) report.warnings.push({ code: 'unknown-tombstone-record-kind' });
    if (report.metaMalformedCount) report.warnings.push({ code: 'malformed-tombstone-meta' });
    if (report.inconsistentRestoreCount) report.warnings.push({ code: 'inconsistent-tombstone-restore-fields' });
    if (report.cascadeMissingParentRefCount) report.warnings.push({ code: 'cascade-tombstone-missing-parent-ref' });

    return report;
  }

  function buildCoverage(bundle, localState, maxSamples) {
    var coverage = {};
    for (var i = 0; i < KINDS.length; i++) {
      var kind = KINDS[i];
      var rows = extractByKind(bundle, kind);
      var c = {
        total: rows.length,
        missingStableId: 0,
        missingCreatedAt: 0,
        missingUpdatedAt: 0,
        missingDigest: 0,
        missingRecordSchemaVersion: 0,
        missingSourceAttribution: 0,
        sampleIds: []
      };
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        var id = safeString(r.id || r.chatId || r.snapshotId);
        if (!id) c.missingStableId++;
        if (!isIsoLike(r.createdAt) && !isIsoLike(r.firstSeenAt) && !isIsoLike(r.capturedAt) && !isIsoLike(r.boundAt) && !isIsoLike(r.linkedAt)) c.missingCreatedAt++;
        if (!isIsoLike(r.updatedAt) && !isIsoLike(r.lastSeenAt) && !isIsoLike(r.cachedAt) && !isIsoLike(r.lastCapturedAt)) c.missingUpdatedAt++;
        /* Digests are only meaningful for snapshots today. */
        if (kind === 'snapshot' && !safeString(r.digest)) c.missingDigest++;
        if (kind !== 'snapshot') c.missingDigest++; /* signals "no per-record digest concept yet" */
        if (r.recordSchemaVersion == null) c.missingRecordSchemaVersion++;
        if (!safeString(r.source)) c.missingSourceAttribution++;
        if (c.sampleIds.length < maxSamples && id) c.sampleIds.push(id);
      }
      coverage[kind] = c;
    }
    return coverage;
  }

  function buildPeerEnumeration(bundle, localState) {
    var b = safeObject(bundle);
    var surface = safeString(b.exportedFromSurface) || 'unknown-surface';
    var extId = safeString(b.exportedFromExtensionId) || 'unknown-extension';
    var enumerated = [];
    var captureSources = [];
    var warnings = [];

    var surfaceKind = surface;
    var appKind, storeKind;
    if (/desktop-tauri/i.test(surface)) {
      appKind = 'tauri-desktop';
      storeKind = 'sqlite';
      surfaceKind = 'studio-desktop';
    } else if (/chrome|mv3/i.test(surface)) {
      appKind = 'mv3-chrome';
      storeKind = 'idb-archive';
      surfaceKind = 'studio-chrome';
    } else if (/mobile|expo/i.test(surface)) {
      appKind = 'expo-mobile';
      storeKind = 'expo-fs';
      surfaceKind = 'studio-mobile';
    } else {
      appKind = 'unknown';
      storeKind = 'unknown';
    }

    enumerated.push({
      provisionalPeerKey: surfaceKind + ':' + appKind + ':' + storeKind,
      surfaceKind: surfaceKind,
      appKind: appKind,
      storeKind: storeKind,
      bundleExtensionId: extId,
      source: 'bundle',
      isCaptureSourceOnly: false,
      note: 'Enumerated from envelope exportedFromSurface/exportedFromExtensionId. No installId minted (F1A does not mint identity).'
    });

    /* Capture-source detection: scan chat + snapshot records for native host attribution.
     * Native content-script origins feed the owning peer; they are NOT separate peers. */
    var chats = extractChats(bundle);
    var snaps = extractSnapshots(bundle);
    var hostCounts = Object.create(null);
    var captureCounts = Object.create(null);
    var i;
    for (i = 0; i < chats.length; i++) {
      var ch = chats[i].host;
      if (ch && NATIVE_HOST_PATTERN.test(ch)) hostCounts[ch] = (hostCounts[ch] || 0) + 1;
      var cs = chats[i].captureSource;
      if (cs && NATIVE_HOST_PATTERN.test(cs)) captureCounts[cs] = (captureCounts[cs] || 0) + 1;
    }
    for (i = 0; i < snaps.length; i++) {
      var sh = snaps[i].host;
      if (sh && NATIVE_HOST_PATTERN.test(sh)) hostCounts[sh] = (hostCounts[sh] || 0) + 1;
    }
    var owner = enumerated[0].provisionalPeerKey;
    Object.keys(hostCounts).forEach(function (h) {
      captureSources.push({
        origin: h,
        kind: 'native-host',
        attachedToPeerKey: owner,
        recordCount: hostCounts[h],
        note: 'Native content-script origin feeding the owning peer\'s store; classified as capture source per F1A peer-model correction (not a separate peer).'
      });
    });
    Object.keys(captureCounts).forEach(function (h) {
      captureSources.push({
        origin: h,
        kind: 'native-capture-source',
        attachedToPeerKey: owner,
        recordCount: captureCounts[h],
        note: 'Capture-source attribution found on records; classified as capture source per F1A peer-model correction.'
      });
    });

    /* Defensive: if extension id is empty or surface is unknown, flag it. */
    if (!extId) warnings.push('Envelope has empty exportedFromExtensionId.');
    if (!surface) warnings.push('Envelope has empty exportedFromSurface.');
    if (surfaceKind === surface && appKind === 'unknown') {
      warnings.push('Surface "' + surface + '" did not match any known peer pattern; falling back to raw value.');
    }
    return { enumerated: enumerated, captureSources: captureSources, warnings: warnings };
  }

  function buildTombstoneCandidates(bundle, localState, maxSamples) {
    var byKind = {};
    var totalCount = 0;
    if (!localState) {
      return {
        description: 'Records present locally but absent from the bundle (skipped: no localState provided).',
        byKind: byKind,
        totalCount: 0,
        note: 'Pass localState to multiPeerDiff to enable would-be-tombstone detection.'
      };
    }
    for (var i = 0; i < KINDS.length; i++) {
      var kind = KINDS[i];
      var bundleRows = extractByKind(bundle, kind);
      var localRows = asArray(localState[kind]);
      var bundleIds = Object.create(null);
      var j;
      for (j = 0; j < bundleRows.length; j++) {
        var bid = safeString(bundleRows[j].id || bundleRows[j].chatId || bundleRows[j].snapshotId);
        if (bid) bundleIds[bid] = true;
      }
      var sampleIds = [];
      var count = 0;
      for (j = 0; j < localRows.length; j++) {
        var lid = safeString(localRows[j].id || localRows[j].chatId || localRows[j].snapshotId);
        if (!lid) continue;
        if (!bundleIds[lid]) {
          count++;
          if (sampleIds.length < maxSamples) sampleIds.push(lid);
        }
      }
      byKind[kind] = { count: count, sampleIds: sampleIds };
      totalCount += count;
    }
    return {
      description: 'Records present locally but absent from the bundle.',
      byKind: byKind,
      totalCount: totalCount,
      note: 'Under current absence-based deletion semantics these would be silently dropped on a multi-peer apply. Under F5+ they would require explicit tombstones.'
    };
  }

  function classifyField(field) {
    if (FIELD_BUCKETS[field]) return FIELD_BUCKETS[field];
    if (field.indexOf('state.') === 0) return 'conflict:needs-review';
    /* Default for any unknown field on a saved-chat: needs-review (safer). */
    return 'conflict:needs-review';
  }

  function compareScalar(kind, id, field, bundleVal, localVal, samples, maxSamples, peerLabels) {
    if (deepEqualScalar(bundleVal, localVal)) return;
    var bucket = classifyField(field);
    var sample = {
      kind: kind,
      id: id,
      field: field,
      bucket: bucket,
      peers: [
        { peerKey: peerLabels.bundle, value: trimScalar(Array.isArray(bundleVal) ? bundleVal.join(',') : bundleVal) },
        { peerKey: peerLabels.local,  value: trimScalar(Array.isArray(localVal) ? localVal.join(',') : localVal) }
      ],
      reason: bucket === 'merge:union' ? 'Additive union of multi-value field; not a conflict.'
            : bucket === 'merge:visual-lww' ? 'Visual metadata; safe LWW by updatedAt.'
            : bucket === 'conflict:hard' ? 'Hard conflict; never LWW.'
            : 'Identity/content-adjacent field on a saved record; not LWW-eligible per F1A merge rules.'
    };
    pushSample(samples[bucket], sample, maxSamples);
  }

  function buildConflicts(bundle, localState, maxSamples) {
    var samples = {
      'merge:union':          [],
      'merge:visual-lww':     [],
      'conflict:needs-review': [],
      'conflict:hard':        []
    };
    var countsByBucket = {
      'merge:union': 0,
      'merge:visual-lww': 0,
      'conflict:needs-review': 0,
      'conflict:hard': 0
    };
    var countsByField = Object.create(null);
    var labels = {
      bundle: 'bundle',
      local:  'local'
    };

    function bumpField(field, bucket) {
      countsByBucket[bucket] = (countsByBucket[bucket] || 0) + 1;
      countsByField[field] = (countsByField[field] || 0) + 1;
    }

    if (!localState) {
      return {
        merge_union:           samples['merge:union'],
        merge_visual_lww:      samples['merge:visual-lww'],
        conflict_needs_review: samples['conflict:needs-review'],
        conflict_hard:         samples['conflict:hard'],
        countsByBucket:        countsByBucket,
        countsByField:         countsByField,
        note: 'Conflict analysis skipped: no localState provided. Pass localState to multiPeerDiff to enable.'
      };
    }

    /* --- Chats ----------------------------------------------------- */
    var bundleChats = extractChats(bundle);
    var localChats = asArray(localState.chat);
    var localChatById = indexById(localChats);
    var b;
    var l;
    var id;

    for (var ci = 0; ci < bundleChats.length; ci++) {
      b = bundleChats[ci];
      id = b.chatId;
      if (!id) continue;
      l = localChatById[id];
      if (!l) continue;

      var fields = ['title', 'href', 'categoryId', 'projectId'];
      for (var fi = 0; fi < fields.length; fi++) {
        var f = fields[fi];
        if (!deepEqualScalar(b[f], l[f])) {
          compareScalar('chat', id, f, b[f], l[f], samples, maxSamples, labels);
          bumpField(f, classifyField(f));
        }
      }
      var stateKeys = ['isSaved', 'isLinked', 'isPinned', 'isArchived'];
      for (var si = 0; si < stateKeys.length; si++) {
        var sk = stateKeys[si];
        var bv = !!safeObject(b.state)[sk];
        var lv = !!safeObject(l.state)[sk];
        if (bv !== lv) {
          compareScalar('chat', id, 'state.' + sk, bv, lv, samples, maxSamples, labels);
          bumpField('state.' + sk, classifyField('state.' + sk));
        }
      }
      if (!deepEqualScalar(b.tagIds, l.tagIds)) {
        compareScalar('chat', id, 'tagIds', b.tagIds, l.tagIds, samples, maxSamples, labels);
        bumpField('tagIds', 'merge:union');
      }
      if (!deepEqualScalar(b.labelIds, l.labelIds)) {
        compareScalar('chat', id, 'labelIds', b.labelIds, l.labelIds, samples, maxSamples, labels);
        bumpField('labelIds', 'merge:union');
      }
      /* Delete-vs-edit: local marks deleted, bundle has non-deleted version with later updatedAt. */
      var localDeleted = !!safeObject(l.state).isDeleted;
      var bundleDeleted = !!safeObject(b.state).isDeleted;
      if (localDeleted !== bundleDeleted) {
        var bucket = 'conflict:hard';
        var sample = {
          kind: 'chat',
          id: id,
          field: 'state.isDeleted',
          bucket: bucket,
          peers: [
            { peerKey: labels.bundle, value: String(bundleDeleted) },
            { peerKey: labels.local,  value: String(localDeleted) }
          ],
          reason: 'Delete-vs-edit divergence; F1A merge rules require explicit review (never auto-resolve).'
        };
        pushSample(samples[bucket], sample, maxSamples);
        bumpField('state.isDeleted', bucket);
      }
    }

    /* --- Snapshots (hard conflict on same id / different digest) -- */
    var bundleSnaps = extractSnapshots(bundle);
    var localSnaps = asArray(localState.snapshot);
    var localSnapById = indexById(localSnaps);
    for (var sj = 0; sj < bundleSnaps.length; sj++) {
      b = bundleSnaps[sj];
      if (!b.snapshotId) continue;
      l = localSnapById[b.snapshotId];
      if (!l) continue;
      if (b.digest && l.digest && b.digest !== l.digest) {
        var hardSample = {
          kind: 'snapshot',
          id: b.snapshotId,
          field: 'digest',
          bucket: 'conflict:hard',
          peers: [
            { peerKey: labels.bundle, value: trimScalar(b.digest) },
            { peerKey: labels.local,  value: trimScalar(l.digest) }
          ],
          reason: 'Same snapshotId with different digest; F1A merge rules: never silently overwrite.'
        };
        pushSample(samples['conflict:hard'], hardSample, maxSamples);
        bumpField('digest', 'conflict:hard');
      }
      /* messageCount divergence on the same snapshotId is a hard conflict
       * (content-adjacent); we read the count, never the messages. */
      if (b.messageCount != null && l.messageCount != null && b.messageCount !== l.messageCount) {
        var contentSample = {
          kind: 'snapshot',
          id: b.snapshotId,
          field: 'messageCount',
          bucket: 'conflict:hard',
          peers: [
            { peerKey: labels.bundle, value: String(b.messageCount) },
            { peerKey: labels.local,  value: String(l.messageCount) }
          ],
          reason: 'Same snapshotId with differing messageCount; content-adjacent disagreement.'
        };
        pushSample(samples['conflict:hard'], contentSample, maxSamples);
        bumpField('messageCount', 'conflict:hard');
      }
    }

    /* --- Folders / Categories / Labels / Tags / Projects ----------- */
    var visualishKinds = ['folder', 'category', 'label', 'tag', 'project'];
    for (var vi = 0; vi < visualishKinds.length; vi++) {
      var vk = visualishKinds[vi];
      var bRows = extractByKind(bundle, vk);
      var lRows = asArray(localState[vk]);
      var lById = indexById(lRows);
      for (var bi = 0; bi < bRows.length; bi++) {
        var br = bRows[bi];
        if (!br.id) continue;
        var lr = lById[br.id];
        if (!lr) continue;
        /* Renames -> needs-review */
        if (!deepEqualScalar(br.name, lr.name) && (br.name || lr.name)) {
          compareScalar(vk, br.id, 'name', br.name, lr.name, samples, maxSamples, labels);
          bumpField('name', 'conflict:needs-review');
        }
        if (!deepEqualScalar(br.parentId, lr.parentId)) {
          compareScalar(vk, br.id, 'parentId', br.parentId, lr.parentId, samples, maxSamples, labels);
          bumpField('parentId', 'conflict:needs-review');
        }
        if (!deepEqualScalar(br.color, lr.color)) {
          compareScalar(vk, br.id, 'color', br.color, lr.color, samples, maxSamples, labels);
          bumpField('color', 'merge:visual-lww');
        }
        if (!deepEqualScalar(br.icon, lr.icon)) {
          compareScalar(vk, br.id, 'icon', br.icon, lr.icon, samples, maxSamples, labels);
          bumpField('icon', 'merge:visual-lww');
        }
        if (!deepEqualScalar(br.position, lr.position)) {
          compareScalar(vk, br.id, 'position', br.position, lr.position, samples, maxSamples, labels);
          bumpField('position', 'merge:visual-lww');
        }
      }
    }

    /* Note: the per-bucket counts above are the count of FIELD-LEVEL
     * disagreements pushed to samples. Aggregate sample arrays are capped
     * at maxSamples per bucket; counts are not capped. */
    return {
      merge_union:           samples['merge:union'],
      merge_visual_lww:      samples['merge:visual-lww'],
      conflict_needs_review: samples['conflict:needs-review'],
      conflict_hard:         samples['conflict:hard'],
      countsByBucket:        countsByBucket,
      countsByField:         countsByField
    };
  }

  function buildInvariants(bundle, localState) {
    var issues = [];
    var chats = extractChats(bundle);
    var snaps = extractSnapshots(bundle);

    /* Every chat has a stable id */
    var everyChatHasId = chats.every(function (c) { return !!c.chatId; });
    if (!everyChatHasId) issues.push('At least one chat in the bundle has no stable id.');

    /* Every snapshot has a digest */
    var everySnapshotHasDigest = snaps.every(function (s) { return !!s.digest; });
    if (!everySnapshotHasDigest) issues.push('At least one snapshot in the bundle has no digest.');

    /* snapshotId uniqueness across chats */
    var seen = Object.create(null);
    var noSnapshotIdReusedAcrossChats = true;
    for (var i = 0; i < snaps.length; i++) {
      var s = snaps[i];
      if (!s.snapshotId) continue;
      if (seen[s.snapshotId] && seen[s.snapshotId] !== s.chatId) {
        noSnapshotIdReusedAcrossChats = false;
        issues.push('Snapshot id "' + s.snapshotId + '" appears on multiple chats.');
        break;
      }
      seen[s.snapshotId] = s.chatId;
    }

    /* Linked-saved invariant: isSaved => isLinked (ADR-0005) */
    var linkedSavedInvariantHolds = true;
    for (var j = 0; j < chats.length; j++) {
      var st = chats[j].state;
      if (st && st.isSaved && !st.isLinked) {
        linkedSavedInvariantHolds = false;
        issues.push('Chat "' + chats[j].chatId + '" is isSaved but not isLinked (ADR-0005 invariant violation).');
        break;
      }
    }

    /* Empty folders preserved in bundle (heuristic) */
    var folders = extractByKind(bundle, 'folder');
    var bindings = extractByKind(bundle, 'folderBinding');
    var boundFolderIds = Object.create(null);
    for (var k = 0; k < bindings.length; k++) {
      var fid = safeString(bindings[k].folderId);
      if (fid) boundFolderIds[fid] = true;
    }
    var hasEmptyFolders = folders.some(function (f) { return f.id && !boundFolderIds[f.id]; });

    return {
      everyChatHasId: everyChatHasId,
      everySnapshotHasDigest: everySnapshotHasDigest,
      noSnapshotIdReusedAcrossChats: noSnapshotIdReusedAcrossChats,
      linkedSavedInvariantHolds: linkedSavedInvariantHolds,
      emptyFoldersPreservedInBundle: hasEmptyFolders,
      issues: issues
    };
  }

  function buildReadiness(report) {
    var env = report.envelope;
    var hardConflicts = (report.conflicts.countsByBucket['conflict:hard']) || 0;
    var needsReview = (report.conflicts.countsByBucket['conflict:needs-review']) || 0;
    var tombstones = report.tombstoneCandidates.totalCount || 0;

    var identity = (env.hasExportId && env.hasSourceSyncPeerId && env.hasSequenceNumber)
      ? 'ok'
      : (env.hasSourceSyncPeerId || env.hasExportId ? 'partial' : 'blocked');

    var deletion = (env.hasTombstoneArray && tombstones === 0)
      ? 'ok'
      : (env.hasTombstoneArray ? 'partial' : 'blocked');

    var conflict = hardConflicts === 0 && needsReview === 0
      ? 'ok'
      : (hardConflicts === 0 ? 'partial' : 'blocked');

    return {
      identity: identity,
      deletion: deletion,
      conflict: conflict,
      summary: 'identity=' + identity + '; deletion=' + deletion + '; conflict=' + conflict +
        '; hardConflicts=' + hardConflicts + '; needsReview=' + needsReview +
        '; tombstoneCandidates=' + tombstones + '. F1A is diagnostic-only; nothing is being changed.'
    };
  }

  /* ─────────────────────────────────────────────────────────────────────
   * Public analyzer (PURE, synchronous)
   * ──────────────────────────────────────────────────────────────────── */

  function multiPeerDiff(input) {
    var inp = isObject(input) ? input : {};
    if (inp.options && inp.options.treatNativeExtensionsAsPeers === true) {
      throw new Error('multiPeerDiff: treatNativeExtensionsAsPeers=true is rejected by the F1A peer model; native content scripts are capture sources, not peers.');
    }
    var bundle = inp.bundle;
    var localStateRaw = inp.localState;
    var maxSamples = (isObject(inp.options) && typeof inp.options.maxSamplesPerBucket === 'number' && inp.options.maxSamplesPerBucket > 0)
      ? inp.options.maxSamplesPerBucket
      : DEFAULT_MAX_SAMPLES;
    var maxConflictCandidates = (isObject(inp.options) && typeof inp.options.maxConflictCandidates === 'number' && inp.options.maxConflictCandidates >= 0)
      ? Math.min(Math.floor(inp.options.maxConflictCandidates), 100)
      : DEFAULT_MAX_CONFLICT_CANDIDATES;

    if (!isObject(bundle)) {
      return {
        schema: REPORT_SCHEMA,
        generatedAt: nowIso(),
        error: 'multiPeerDiff: input.bundle is required and must be an object.',
        inputSummary: { localProvided: !!localStateRaw }
      };
    }
    var localState = normalizeLocalState(localStateRaw);

    var report = {
      schema: REPORT_SCHEMA,
      generatedAt: nowIso(),
      inputSummary: buildInputSummary(bundle, localState),
      envelope: buildEnvelopeReport(bundle),
      tombstones: buildTombstonePayloadReport(bundle),
      coverage: buildCoverage(bundle, localState, maxSamples),
      peers: buildPeerEnumeration(bundle, localState),
      tombstoneCandidates: buildTombstoneCandidates(bundle, localState, maxSamples),
      conflicts: buildConflicts(bundle, localState, maxSamples),
      conflictCandidates: buildConflictCandidates(bundle, localState, maxConflictCandidates),
      invariants: buildInvariants(bundle, localState),
      readiness: null
    };
    report.readiness = buildReadiness(report);
    return report;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * Optional convenience helper (CLEARLY SEPARATE from the analyzer).
   *
   * Reads through public store .list() adapters only. Never writes.
   * The analyzer does NOT depend on this helper.
   * ──────────────────────────────────────────────────────────────────── */

  function collectLocalState() {
    try {
      var Studio = (H2O && H2O.Studio) || {};
      var store = Studio.store || {};
      var kinds = [
        { key: 'chats',      adapter: store.chats },
        { key: 'snapshots',  adapter: store.snapshots },
        { key: 'folders',    adapter: store.folders },
        { key: 'categories', adapter: store.categories },
        { key: 'labels',     adapter: store.labels },
        { key: 'tags',       adapter: store.tags }
      ];
      var tasks = kinds.map(function (k) {
        if (!k.adapter || typeof k.adapter.list !== 'function') {
          return Promise.resolve({ key: k.key, rows: [], skipped: true, reason: 'adapter or .list() not available' });
        }
        return Promise.resolve(k.adapter.list())
          .then(function (rows) { return { key: k.key, rows: asArray(rows), skipped: false }; })
          .catch(function (err) { return { key: k.key, rows: [], skipped: true, reason: String((err && err.message) || err) }; });
      });
      return Promise.all(tasks).then(function (results) {
        var out = { __collectedAt: nowIso(), __skipped: [] };
        for (var i = 0; i < results.length; i++) {
          out[results[i].key] = results[i].rows;
          if (results[i].skipped) out.__skipped.push({ key: results[i].key, reason: results[i].reason });
        }
        return out;
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
   * Registration
   * ──────────────────────────────────────────────────────────────────── */

  H2O.Studio.diagnostics.multiPeerDiff = multiPeerDiff;
  H2O.Studio.diagnostics.collectLocalState = collectLocalState;
  H2O.Studio.diagnostics.__multiPeerDiffInstalled = true;
  H2O.Studio.diagnostics.__multiPeerDiffVersion = '0.1.2-f6.2';

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
