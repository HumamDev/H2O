// ==UserScript==
// @h2o-id             0f1c.library_index
// @name               0F1c.⬛️🗂️ Library Index 🧮🗂️
// @namespace          H2O.Premium.CGX.library_index
// @author             HumamDev
// @version            1.1.0
// @revision           003
// @build              260426-000005
// @description        Library Index: read-only normalized known-chat index, persisted known-chat registry, safer native Recents/known-chat discovery, facets, date buckets, and analytics foundation for Library Workspace Explorer/Analytics.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F1c — Library Index (read-only data/index layer)
   *
   * OWNS:
   *   - A normalized, read-only "Known chats" index built from currently available sources.
   *   - Source merging / dedupe / lightweight cache for Library Workspace Explorer + Analytics.
   *   - Facets, date buckets, and stats over the normalized index.
   *   - Diagnostics and stable public APIs for consumers.
   *
   * MUST NOT OWN:
   *   - Folder truth / bindings                → 0F3a Folders
   *   - Native project cache / fetch            → 0F2a Projects
   *   - Category catalog / grouping             → 0F4a Categories
   *   - Turn tags / keyword extraction          → 0F5a Tags
   *   - Manual labels / label catalog/bindings  → 0F6a Labels
   *   - Archive / workbench canonical rows      → 0D archive/data modules
   *   - Library page/workspace UI               → 0F1b Library Workspace
   *   - LibraryCore shared services             → 0F1a Library Core
   *
   * IMPORTANT NAMING:
   *   - "Saved chats" = captured/imported/archive/workbench rows.
   *   - "Recent chats" = native ChatGPT Recents currently discoverable via sidebar DOM and/or
   *     native read-only cache data.
   *   - "Known chats" = merged saved + recent + metadata-only rows known to H2O. This is NOT
   *     guaranteed to be the full ChatGPT account history.
   *
   * DESIGN:
   *   - Read through public owner/service APIs first.
   *   - Never mutate foreign data stores.
   *   - Never move sidebar DOM.
   *   - Never require all 0F modules to be loaded; degrade gracefully.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const BOOT_LOCK = '__h2oLibraryIndexBooted_v1_0_0';
  const BOOT_TIMER_SET = '__h2oLibraryIndexBootTimers_v1_0_0';
  const BOOT_MAX_ATTEMPTS = 160;

  function bootWhenLibraryCoreReady(attempt = 0) {
    const core = H2O.LibraryCore;
    if (!core) {
      if (attempt >= BOOT_MAX_ATTEMPTS) {
        try {
          H2O.LibraryIndexBootDiag = { ok: false, status: 'library-core-not-found', attempts: attempt, ts: Date.now() };
        } catch {}
        return;
      }
      if (!H2O[BOOT_TIMER_SET]) H2O[BOOT_TIMER_SET] = new Set();
      const delay = Math.min(1400, 70 + attempt * 30);
      const timer = W.setTimeout(() => {
        try { H2O[BOOT_TIMER_SET]?.delete?.(timer); } catch {}
        bootWhenLibraryCoreReady(attempt + 1);
      }, delay);
      try { H2O[BOOT_TIMER_SET].add(timer); } catch {}
      return;
    }

    try { H2O.LibraryIndexBootDiag = { ok: true, status: 'library-core-ready', attempts: attempt, ts: Date.now() }; } catch {}
    runLibraryIndex(core);
  }

  function runLibraryIndex(coreAtBoot) {
    if (H2O[BOOT_LOCK]) return;
    H2O[BOOT_LOCK] = true;

    const MOD = (H2O.LibraryIndex = H2O.LibraryIndex || {});
    MOD.meta = MOD.meta || {
      owner: '0F1c.library_index',
      label: 'Library Index',
      phase: 'phase-1-index-foundation',
      suite: 'prm',
      host: 'cgx',
    };

    const diag = (MOD.diag = MOD.diag || {
      t0: performance.now(),
      steps: [],
      errors: [],
      events: [],
      bufMax: 220,
      errMax: 60,
      eventMax: 60,
    });

    const step = (s, o = '') => {
      try {
        diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
        if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
      } catch {}
    };

    const err = (s, e) => {
      try {
        diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e || '') });
        if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
      } catch {}
    };

    const evt = (s, o = '') => {
      try {
        diag.events.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
        if (diag.events.length > diag.eventMax) diag.events.splice(0, diag.events.length - diag.eventMax);
      } catch {}
    };

    const TOK = 'LI';
    const PID = 'libraryIndex';
    const SkID = 'lidx';
    const SUITE = 'prm';
    const HOST = 'cgx';

    const NS_DISK = `h2o:${SUITE}:${HOST}:library-index`;
    const KEY_CACHE_V1 = `${NS_DISK}:cache:v1`;
    const KEY_KNOWN_REGISTRY_V1 = `${NS_DISK}:known-registry:v1`;
    const KEY_PREFS_V1 = `${NS_DISK}:prefs:v1`;
    const KNOWN_REGISTRY_ROW_LIMIT = 6000;

    const EV_UPDATED = 'evt:h2o:library-index:updated';
    const EV_REFRESH_REQUEST = 'evt:h2o:library-index:refresh-request';

    const ATTR_CGXUI = 'data-cgxui';
    const ATTR_CGXUI_OWNER = 'data-cgxui-owner';

    const SEL = Object.freeze({
      nav: 'nav',
      aside: 'aside',
      header: 'h2.__menu-label, h2, [role="heading"]',
      expandoSectionA: 'div.group\\/sidebar-expando-section',
      expandoSectionB: 'div[class*="sidebar-expando-section"]',
      sidebarItemAnchor: 'a.__menu-item[href], a[href*="/c/"]',
      sidebarTruncate: '.truncate,[class*="truncate"]',
    });

    const SOURCE_RANK = Object.freeze({
      archive: 100,
      saved: 96,
      imported: 92,
      categories: 82,
      labels: 80,
      folders: 78,
      tags: 74,
      projects: 64,
      recents: 58,
      indexed: 54,
      'labels-binding': 50,
      unknown: 10,
    });

    const state = (MOD.state = MOD.state || {
      booted: false,
      model: null,
      refreshPromise: null,
      lastRefreshAt: 0,
      lastSourceStatus: null,
      lastNativeRecentsDiag: null,
      lastKnownRegistryCount: 0,
      scheduledRefreshTimer: 0,
      listenersBound: false,
      clean: { timers: new Set(), listeners: new Set() },
    });
    state.clean = state.clean || { timers: new Set(), listeners: new Set() };

    const storage = {
      getJSON(key, fallback = null) {
        try {
          const raw = W.localStorage?.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      setJSON(key, value) {
        try {
          W.localStorage?.setItem(key, JSON.stringify(value));
          return true;
        } catch (e) {
          err(`storage-set:${key}`, e);
          return false;
        }
      },
      del(key) {
        try { W.localStorage?.removeItem(key); return true; } catch { return false; }
      },
    };

    function coreNow() {
      return H2O.LibraryCore || coreAtBoot || null;
    }

    function ownerOrService(name, fallback = null) {
      const core = coreNow();
      try {
        return core?.getService?.(name) || core?.getOwner?.(name) || fallback || null;
      } catch {
        return fallback || null;
      }
    }

    function archiveApi() { return H2O.archiveBoot || H2O.archive || null; }
    function foldersApi() { return ownerOrService('folders', H2O.folders || H2O.FS?.fldrs || null); }
    function projectsApi() { return ownerOrService('projects', H2O.Projects || null); }
    function categoriesApi() { return ownerOrService('categories', H2O.Categories || null); }
    function tagsApi() { return ownerOrService('tags', H2O.Tags || null); }
    function labelsApi() { return ownerOrService('labels', H2O.Labels || null); }

    function normText(raw = '') {
      return String(raw || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
    }

    function slug(raw = '') {
      return normText(raw).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
    }

    function uniqueStrings(rows) {
      const out = [];
      const seen = new Set();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const value = normText(row);
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return;
        seen.add(key);
        out.push(value);
      });
      return out;
    }

    function normalizeChatId(raw = '') {
      const value = String(raw || '').trim();
      if (!value) return '';
      const hrefMatch = value.match(/\/c\/([a-z0-9-]+)/i);
      if (hrefMatch) return hrefMatch[1];
      return value.replace(/^chat:/i, '').trim();
    }

    function parseChatIdFromHref(href = '') {
      const match = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
      return match ? match[1] : '';
    }

    function hrefForChatId(chatIdRaw = '') {
      const chatId = normalizeChatId(chatIdRaw);
      if (!chatId || /^imported[-_:]/i.test(chatId)) return '';
      return `/c/${encodeURIComponent(chatId)}`;
    }

    function dateMs(value) {
      const raw = String(value || '').trim();
      if (!raw) return 0;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function isoOrEmpty(value) {
      const ms = dateMs(value);
      if (!ms) return '';
      try { return new Date(ms).toISOString(); } catch { return ''; }
    }

    function pickNewerDate(a, b) {
      const ma = dateMs(a);
      const mb = dateMs(b);
      if (!ma) return b || '';
      if (!mb) return a || '';
      return ma >= mb ? a : b;
    }

    function compareDateDesc(a, b, field = 'sortAt') {
      const da = dateMs(readDateField(a, field));
      const db = dateMs(readDateField(b, field));
      if (da !== db) return db - da;
      return 0;
    }

    function readDateField(row, field = 'sortAt') {
      const f = String(field || 'sortAt');
      if (f === 'best' || f === 'sortAt') return row?.sortAt || row?.updatedAt || row?.savedAt || row?.lastSeenAt || row?.createdAt || row?.observedAt || '';
      return row?.[f] || row?.dates?.[f] || '';
    }

    function sourceRank(source) {
      const key = String(source || '').trim().toLowerCase();
      return SOURCE_RANK[key] || SOURCE_RANK.unknown;
    }

    function normalizeSource(source = '') {
      const s = String(source || '').trim().toLowerCase();
      if (!s) return 'unknown';
      if (/archive|workbench|snapshot|capture|saved/.test(s)) return 'archive';
      if (/import/.test(s)) return 'imported';
      if (/recent|recents|native/.test(s)) return 'recents';
      if (/\bindexed?\b|registry|discover/.test(s)) return 'indexed';
      if (/label/.test(s)) return s === 'labels-binding' ? 'labels-binding' : 'labels';
      if (/categor/.test(s)) return 'categories';
      if (/folder/.test(s)) return 'folders';
      if (/project/.test(s)) return 'projects';
      if (/tag/.test(s)) return 'tags';
      return s;
    }

    function mergeSourceArrays(a = [], b = []) {
      const out = [];
      const seen = new Set();
      [...(Array.isArray(a) ? a : String(a || '').split('+')), ...(Array.isArray(b) ? b : String(b || '').split('+'))].forEach((source) => {
        const src = normalizeSource(source);
        if (!src || src === 'unknown' || seen.has(src)) return;
        seen.add(src);
        out.push(src);
      });
      if (out.includes('indexed') && out.some((src) => src && src !== 'indexed')) {
        return out.filter((src) => src !== 'indexed').sort((x, y) => sourceRank(y) - sourceRank(x) || x.localeCompare(y));
      }
      return out.sort((x, y) => sourceRank(y) - sourceRank(x) || x.localeCompare(y));
    }

    function bestSource(sources = []) {
      const rows = mergeSourceArrays(sources);
      return rows[0] || 'unknown';
    }

    function normalizeChatRow(row, source = '', extra = {}) {
      const src = row && typeof row === 'object' ? row : {};
      const normalizedSource = normalizeSource(source || src.source || src.origin || src.originSource || '');
      const href = normText(src.href || src.url || src.path || src.link || '');
      const chatId = normalizeChatId(src.chatId || src.conversationId || src.id || parseChatIdFromHref(href));
      const title = normText(src.title || src.name || src.label || src.excerpt || src.summary || src.chatTitle || chatId || href || 'Untitled chat').slice(0, 220);
      const createdAt = isoOrEmpty(src.createdAt || src.createTime || src.create_time || src.created || '');
      const updatedAt = isoOrEmpty(src.updatedAt || src.lastActivityAt || src.updateTime || src.update_time || src.modifiedAt || src.savedAt || src.capturedAt || '');
      const savedAt = isoOrEmpty(src.savedAt || src.capturedAt || src.snapshotCapturedAt || src.archivedAt || '');
      const lastSeenAt = isoOrEmpty(src.lastSeenAt || src.lastViewedAt || '');
      const observedAt = isoOrEmpty(extra.observedAt || '');
      const id = chatId || href || `title:${slug(title)}`;
      const isSaved = normalizedSource === 'archive' || normalizedSource === 'saved' || normalizedSource === 'imported' || !!src.snapshotId || !!src.capturedAt || src.isSavedHint === true;
      const isRecent = normalizedSource === 'recents';
      return {
        id,
        chatId,
        title,
        href: href || hrefForChatId(chatId),
        sources: normalizedSource === 'unknown' ? [] : [normalizedSource],
        source: normalizedSource,
        isSaved,
        isRecent,
        isImported: normalizedSource === 'imported' || /^imported[-_:]/i.test(chatId) || src.isImportedHint === true,
        isArchived: src.archived === true || src.isArchived === true || src.is_archived === true,
        isPinned: src.pinned === true || src.isPinned === true || !!src.pinned_time,
        createdAt,
        updatedAt,
        savedAt,
        lastSeenAt,
        observedAt,
        sortAt: pickNewerDate(updatedAt, pickNewerDate(savedAt, pickNewerDate(lastSeenAt, observedAt))),
        nativeOrder: Number.isFinite(Number(src.nativeOrder ?? extra.nativeOrder)) ? Number(src.nativeOrder ?? extra.nativeOrder) : null,
        nativeRecentsMode: normText(src.nativeRecentsMode || extra.nativeRecentsMode || ''),
        nativeRecentsSource: normText(src.nativeRecentsSource || extra.nativeRecentsSource || ''),
        folderIds: [],
        folderNames: [],
        labels: [],
        labelIds: [],
        labelNames: [],
        categories: [],
        categoryIds: [],
        categoryNames: [],
        projectId: normText(src.projectId || src.nativeProjectId || src.gizmoId || src.project?.id || ''),
        projectName: normText(src.projectName || src.nativeProjectName || src.gizmoName || src.project?.title || src.project?.name || ''),
        tags: [],
        tagIds: [],
        tagNames: [],
        keywords: uniqueStrings(Array.isArray(src.keywords) ? src.keywords : []),
        confidence: isSaved ? 'high' : isRecent ? 'medium' : 'low',
        evidence: normalizedSource === 'unknown' ? [] : [{ source: normalizedSource, at: Date.now() }],
      };
    }

    function mergeObjectsById(a = [], b = [], idKeys = ['id'], labelKeys = ['label', 'name', 'title']) {
      const map = new Map();
      const put = (raw) => {
        const src = raw && typeof raw === 'object' ? raw : { label: raw };
        const id = normText(idKeys.map((k) => src[k]).find(Boolean) || slug(labelKeys.map((k) => src[k]).find(Boolean) || ''));
        const label = normText(labelKeys.map((k) => src[k]).find(Boolean) || id);
        if (!id && !label) return;
        const key = (id || label).toLowerCase();
        const prev = map.get(key) || {};
        map.set(key, { ...prev, ...src, id: id || prev.id || slug(label), label: label || prev.label || id });
      };
      (Array.isArray(a) ? a : []).forEach(put);
      (Array.isArray(b) ? b : []).forEach(put);
      return Array.from(map.values());
    }

    function mergeChatRecord(prevRaw, nextRaw) {
      const prev = prevRaw && typeof prevRaw === 'object' ? prevRaw : {};
      const next = nextRaw && typeof nextRaw === 'object' ? nextRaw : {};
      const sources = mergeSourceArrays(prev.sources || prev.source, next.sources || next.source);
      const merged = {
        ...prev,
        ...next,
        id: prev.id || next.id,
        chatId: prev.chatId || next.chatId || '',
        href: prev.href || next.href || '',
        title: chooseBetterTitle(prev.title, next.title, prev.id || next.id),
        sources,
        source: bestSource(sources),
        isSaved: !!(prev.isSaved || next.isSaved),
        isRecent: !!(prev.isRecent || next.isRecent),
        isImported: !!(prev.isImported || next.isImported),
        isArchived: !!(prev.isArchived || next.isArchived),
        isPinned: !!(prev.isPinned || next.isPinned),
        createdAt: pickOlderDate(prev.createdAt, next.createdAt),
        updatedAt: pickNewerDate(prev.updatedAt, next.updatedAt),
        savedAt: pickNewerDate(prev.savedAt, next.savedAt),
        lastSeenAt: pickNewerDate(prev.lastSeenAt, next.lastSeenAt),
        observedAt: pickNewerDate(prev.observedAt, next.observedAt),
        nativeRecentsMode: prev.nativeRecentsMode || next.nativeRecentsMode || '',
        nativeRecentsSource: prev.nativeRecentsSource || next.nativeRecentsSource || '',
        folderIds: uniqueStrings([...(prev.folderIds || []), ...(next.folderIds || [])]),
        folderNames: uniqueStrings([...(prev.folderNames || []), ...(next.folderNames || [])]),
        labels: mergeObjectsById(prev.labels, next.labels, ['key', 'id'], ['label', 'name']),
        categories: mergeObjectsById(prev.categories, next.categories, ['id'], ['name', 'label']),
        tags: mergeObjectsById(prev.tags, next.tags, ['id'], ['label', 'name']),
        keywords: uniqueStrings([...(prev.keywords || []), ...(next.keywords || [])]),
        evidence: [...(Array.isArray(prev.evidence) ? prev.evidence : []), ...(Array.isArray(next.evidence) ? next.evidence : [])].slice(-12),
        confidence: higherConfidence(prev.confidence, next.confidence),
      };
      merged.labelIds = uniqueStrings(merged.labels.map((item) => item.key || item.id || item.label));
      merged.labelNames = uniqueStrings(merged.labels.map((item) => item.label || item.name || item.id));
      merged.categoryIds = uniqueStrings(merged.categories.map((item) => item.id || item.label || item.name));
      merged.categoryNames = uniqueStrings(merged.categories.map((item) => item.name || item.label || item.id));
      merged.tagIds = uniqueStrings(merged.tags.map((item) => item.id || item.label || item.name));
      merged.tagNames = uniqueStrings(merged.tags.map((item) => item.label || item.name || item.id));
      merged.projectId = prev.projectId || next.projectId || '';
      merged.projectName = prev.projectName || next.projectName || '';
      merged.sortAt = pickNewerDate(merged.updatedAt, pickNewerDate(merged.savedAt, pickNewerDate(merged.lastSeenAt, merged.observedAt)));
      return merged;
    }

    function chooseBetterTitle(a = '', b = '', fallback = '') {
      const aa = normText(a);
      const bb = normText(b);
      if (!aa) return bb || fallback || '';
      if (!bb) return aa;
      if (/^[a-z0-9-]{8,}$/i.test(aa) && !/^[a-z0-9-]{8,}$/i.test(bb)) return bb;
      return aa.length >= bb.length ? aa : bb;
    }

    function pickOlderDate(a, b) {
      const ma = dateMs(a);
      const mb = dateMs(b);
      if (!ma) return b || '';
      if (!mb) return a || '';
      return ma <= mb ? a : b;
    }

    function higherConfidence(a = 'low', b = 'low') {
      const rank = { low: 1, medium: 2, high: 3 };
      return (rank[b] || 1) > (rank[a] || 1) ? b : a;
    }

    function buildEmptyModel(reason = 'empty') {
      return {
        ok: true,
        version: 1,
        builtAt: Date.now(),
        builtAtIso: new Date().toISOString(),
        durationMs: 0,
        reason,
        sourceStatus: sourceStatus(),
        counts: emptyCounts(),
        chats: [],
        knownChats: [],
        savedChats: [],
        recentChats: [],
        folders: [],
        labels: [],
        categories: [],
        projects: [],
        tags: [],
        facets: emptyFacets(),
      };
    }

    function emptyCounts() {
      return {
        knownChats: 0,
        savedChats: 0,
        recentChats: 0,
        nativeRecentChats: 0,
        importedChats: 0,
        folders: 0,
        labels: 0,
        categories: 0,
        projects: 0,
        tags: 0,
        undated: 0,
        unfiledSaved: 0,
        unlabeledSaved: 0,
        uncategorizedSaved: 0,
      };
    }

    function emptyFacets() {
      return { sources: [], folders: [], labels: [], categories: [], projects: [], tags: [], years: [], months: [] };
    }

    function emptySourceStatus(mode = 'best-effort') {
      return {
        core: false,
        archive: false,
        nativeRecents: false,
        folders: false,
        projects: false,
        categories: false,
        tags: false,
        labels: false,
        nativeRecentsSectionFound: false,
        nativeRecentsExpanded: false,
        nativeRecentsVisibleCount: 0,
        nativeRecentsLoadedCount: 0,
        nativeRecentsBestEffortCount: 0,
        nativeRecentsCacheCount: 0,
        nativeRecentsCacheKeys: 0,
        nativeRecentsDeclaredTotal: 0,
        nativeConversationHistoryCacheFound: false,
        knownRegistryAvailable: false,
        knownRegistryCount: 0,
        nativeRecentsCollectionMode: mode,
        completenessLevel: mode === 'visible' ? 'visible-only' : mode === 'loaded' ? 'loaded-dom' : 'best-effort',
        chatHistoryCompleteness: mode === 'visible' ? 'visible-only' : mode === 'loaded' ? 'loaded-dom' : 'best-effort',
        allChatHistoryAvailable: false,
      };
    }

    function sourceStatus(nativeDiag = null, opts = {}) {
      const c = coreNow();
      const mode = String(opts.mode || nativeDiag?.nativeRecentsCollectionMode || 'best-effort').toLowerCase();
      const diagRow = nativeDiag && typeof nativeDiag === 'object' ? nativeDiag : inspectNativeRecents({ mode }).diagnostics;
      const registry = readKnownChatRegistry();
      const out = {
        core: !!c,
        archive: typeof archiveApi()?.listWorkbenchRows === 'function',
        nativeRecents: !!(diagRow.nativeRecentsSectionFound || diagRow.nativeConversationHistoryCacheFound || diagRow.nativeRecentsBestEffortCount),
        folders: !!foldersApi(),
        projects: !!projectsApi(),
        categories: !!categoriesApi(),
        tags: !!tagsApi(),
        labels: !!labelsApi(),
        knownRegistryAvailable: !!registry?.rows?.length,
        knownRegistryCount: Array.isArray(registry?.rows) ? registry.rows.length : 0,
      };
      return { ...emptySourceStatus(mode), ...diagRow, ...out };
    }

    async function buildModel(reason = 'refresh') {
      const startedAt = performance.now();
      const observedAt = new Date().toISOString();
      const model = buildEmptyModel(reason);
      const chatMap = new Map();

      const upsert = (raw, source = '', extra = {}) => {
        try {
          const row = normalizeChatRow(raw, source, { observedAt, ...extra });
          if (!row.id) return null;
          const key = row.chatId || row.href || row.id;
          const prev = chatMap.get(key) || null;
          const merged = prev ? mergeChatRecord(prev, row) : row;
          chatMap.set(key, merged);
          return merged;
        } catch (e) {
          err(`upsert:${source}`, e);
          return null;
        }
      };

      const sourceRows = await collectSources({ upsert, observedAt });

      const chats = Array.from(chatMap.values());
      enrichWithFolders(chats, sourceRows.folders);
      enrichWithCategories(chats, sourceRows.categoryGroups);
      enrichWithLabels(chats, sourceRows.labelsOwner, sourceRows.labels);
      enrichWithTags(chats, sourceRows.tagsOwner);
      enrichWithProjects(chats, sourceRows.projects);

      finalizeChats(chats);

      model.chats = chats.slice().sort((a, b) => compareDateDesc(a, b, 'sortAt') || String(a.title || '').localeCompare(String(b.title || '')));
      model.knownChats = model.chats;
      model.savedChats = model.chats.filter((row) => row.isSaved).sort((a, b) => compareDateDesc(a, b, 'sortAt') || String(a.title || '').localeCompare(String(b.title || '')));
      model.recentChats = model.chats.filter((row) => row.isRecent).sort((a, b) => {
        const ao = Number.isFinite(Number(a.nativeOrder)) ? Number(a.nativeOrder) : 999999;
        const bo = Number.isFinite(Number(b.nativeOrder)) ? Number(b.nativeOrder) : 999999;
        return ao - bo || compareDateDesc(a, b, 'sortAt') || String(a.title || '').localeCompare(String(b.title || ''));
      });
      model.folders = sourceRows.folders;
      model.labels = sourceRows.labels;
      model.categories = normalizeCategoryList(sourceRows.categoryGroups, model.chats);
      model.projects = sourceRows.projects;
      model.tags = collectTagFacets(model.chats);
      model.sourceStatus = sourceStatus(sourceRows.nativeRecentsDiag);
      model.counts = buildCounts(model);
      model.facets = buildFacets(model.chats, model);
      model.durationMs = Math.round(performance.now() - startedAt);
      state.lastNativeRecentsDiag = sourceRows.nativeRecentsDiag || null;
      state.lastSourceStatus = model.sourceStatus || null;
      return model;
    }

    async function collectSources(ctx) {
      const indexedRows = readKnownChatRegistryRows();
      indexedRows.forEach((row) => ctx.upsert(row, 'indexed'));

      const archiveRows = safeListArchiveRows();
      archiveRows.forEach((row) => ctx.upsert(row, detectArchiveSource(row)));

      const nativeRecents = inspectNativeRecents({ mode: 'best-effort', observedAt: ctx.observedAt });
      const recentRows = nativeRecents.rows;
      recentRows.forEach((row) => ctx.upsert(row, 'recents'));

      const folders = safeListFolders();
      const projects = await safeListProjects();
      const labelsOwner = labelsApi();
      const labels = safeListLabels(labelsOwner);
      const tagsOwner = tagsApi();
      const categoryGroups = await safeLoadCategoryGroups(ctx.upsert);

      safeListLabelKnownChats(labelsOwner).forEach((row) => {
        const source = normalizeSource(row?.source || 'labels');
        ctx.upsert(row, source);
      });

      categoryGroups.forEach((group) => {
        (Array.isArray(group?.rows) ? group.rows : []).forEach((row) => ctx.upsert(row, 'categories'));
      });

      return { indexedRows, archiveRows, recentRows, nativeRecentsDiag: nativeRecents.diagnostics, folders, projects, labelsOwner, labels, tagsOwner, categoryGroups };
    }

    function detectArchiveSource(row) {
      const raw = String(row?.source || row?.origin || row?.originSource || '').toLowerCase();
      if (/import/.test(raw) || /^imported[-_:]/i.test(String(row?.chatId || row?.id || ''))) return 'imported';
      return 'archive';
    }

    function safeListArchiveRows() {
      try {
        const rows = archiveApi()?.listWorkbenchRows?.();
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        err('archive:listWorkbenchRows', e);
        return [];
      }
    }

    function findNativeHeaderSection(matcher) {
      try {
        const roots = [D.querySelector(SEL.nav), D.querySelector(SEL.aside), D.body].filter(Boolean);
        for (const root of roots) {
          const labels = Array.from(root.querySelectorAll(SEL.header));
          const label = labels.find((el) => matcher.test(normText(el.textContent || '')));
          if (!label) continue;
          const button = label.closest('button') || label.parentElement;
          const section = button?.closest?.(SEL.expandoSectionA) || button?.closest?.(SEL.expandoSectionB) || label.closest?.(SEL.expandoSectionA) || label.closest?.(SEL.expandoSectionB);
          if (section instanceof HTMLElement) return section;
          const parent = button?.parentElement || label.parentElement;
          if (parent instanceof HTMLElement) return parent;
        }
      } catch (e) {
        err('find-native-header-section', e);
      }
      return null;
    }

    function findRecentsSection() {
      return findNativeHeaderSection(/^recents?\b/i);
    }

    function normalizeNativeRecentsMode(mode = 'best-effort') {
      const value = String(mode || 'best-effort').trim().toLowerCase();
      if (value === 'visible' || value === 'loaded' || value === 'best-effort') return value;
      return 'best-effort';
    }

    function resolveNativeRecentOptions(arg = null, fallback = {}) {
      const base = {
        mode: 'best-effort',
        observedAt: new Date().toISOString(),
      };
      if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        return {
          ...base,
          ...fallback,
          ...arg,
          mode: normalizeNativeRecentsMode(arg.mode || fallback.mode || base.mode),
          observedAt: isoOrEmpty(arg.observedAt || fallback.observedAt || base.observedAt) || base.observedAt,
        };
      }
      if (typeof arg === 'string') {
        const trimmed = arg.trim();
        if (trimmed === 'visible' || trimmed === 'loaded' || trimmed === 'best-effort') {
          return {
            ...base,
            ...fallback,
            mode: normalizeNativeRecentsMode(trimmed),
            observedAt: isoOrEmpty(fallback.observedAt || base.observedAt) || base.observedAt,
          };
        }
        return {
          ...base,
          ...fallback,
          mode: normalizeNativeRecentsMode(fallback.mode || base.mode),
          observedAt: isoOrEmpty(trimmed || fallback.observedAt || base.observedAt) || base.observedAt,
        };
      }
      return {
        ...base,
        ...fallback,
        mode: normalizeNativeRecentsMode(fallback.mode || base.mode),
        observedAt: isoOrEmpty(fallback.observedAt || base.observedAt) || base.observedAt,
      };
    }

    function isElementVisible(el) {
      try {
        if (!(el instanceof HTMLElement)) return false;
        const style = W.getComputedStyle?.(el);
        if (style?.display === 'none' || style?.visibility === 'hidden' || Number(style?.opacity || 1) <= 0) return false;
        if (el.closest?.('[hidden],[aria-hidden="true"]')) return false;
        const rect = el.getBoundingClientRect?.();
        if (!rect) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        const vh = W.innerHeight || D.documentElement?.clientHeight || 0;
        return rect.bottom > 0 && (!vh || rect.top < vh);
      } catch (e) {
        err('native-recents:is-visible', e);
        return false;
      }
    }

    function readNativeRecentsToggle(section) {
      try {
        if (!(section instanceof HTMLElement)) return false;
        const toggle = section.querySelector('button[aria-expanded]') || null;
        if (toggle instanceof HTMLElement) return toggle.getAttribute('aria-expanded') !== 'false';
      } catch (e) {
        err('native-recents:toggle', e);
      }
      return null;
    }

    function mergeNativeRecentRows(prevRaw, nextRaw) {
      const prev = prevRaw && typeof prevRaw === 'object' ? prevRaw : {};
      const next = nextRaw && typeof nextRaw === 'object' ? nextRaw : {};
      return {
        ...prev,
        ...next,
        chatId: prev.chatId || next.chatId || '',
        href: prev.href || next.href || '',
        title: chooseBetterTitle(prev.title, next.title, prev.chatId || next.chatId || prev.href || next.href || ''),
        source: 'recents',
        createdAt: prev.createdAt || next.createdAt || prev.create_time || next.create_time || '',
        updatedAt: prev.updatedAt || next.updatedAt || prev.update_time || next.update_time || '',
        nativeOrder: Number.isFinite(Number(prev.nativeOrder)) ? Number(prev.nativeOrder) : (Number.isFinite(Number(next.nativeOrder)) ? Number(next.nativeOrder) : null),
        observedAt: prev.observedAt || next.observedAt || '',
        nativeRecentsMode: prev.nativeRecentsMode || next.nativeRecentsMode || '',
        nativeRecentsSource: prev.nativeRecentsSource || next.nativeRecentsSource || '',
      };
    }

    function dedupeNativeRecentRows(rows = []) {
      const out = [];
      const indexByKey = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = normalizeChatId(row?.chatId || row?.id || row?.href || '') || normText(row?.href || row?.title || '');
        if (!key) return;
        const at = indexByKey.get(key);
        if (Number.isInteger(at)) {
          out[at] = mergeNativeRecentRows(out[at], row);
          return;
        }
        indexByKey.set(key, out.length);
        out.push(row);
      });
      return out;
    }

    function collectNativeRecentDomRows(observedAt = new Date().toISOString()) {
      const rows = [];
      const section = findRecentsSection();
      const expanded = readNativeRecentsToggle(section);
      try {
        if (!(section instanceof HTMLElement)) {
          return {
            rows,
            visibleRows: rows,
            diagnostics: {
              nativeRecentsSectionFound: false,
              nativeRecentsExpanded: false,
              nativeRecentsVisibleCount: 0,
              nativeRecentsLoadedCount: 0,
            },
          };
        }
        Array.from(section.querySelectorAll(SEL.sidebarItemAnchor)).forEach((a, index) => {
          if (!(a instanceof HTMLElement)) return;
          if (a.closest(`[${ATTR_CGXUI_OWNER}]`)) return;
          const href = normText(a.getAttribute('href') || '');
          const chatId = parseChatIdFromHref(href);
          if (!chatId) return;
          const title = normText(a.querySelector?.(SEL.sidebarTruncate)?.textContent || a.innerText || a.textContent || chatId).slice(0, 220);
          if (!title || /^more$/i.test(title) || /^recents?$/i.test(title)) return;
          rows.push({
            chatId,
            href,
            title,
            source: 'recents',
            nativeOrder: index,
            observedAt,
            nativeRecentsMode: 'loaded',
            nativeRecentsSource: 'sidebar-dom',
            __visible: isElementVisible(a),
          });
        });
      } catch (e) {
        err('native-recents:dom', e);
      }
      const deduped = dedupeNativeRecentRows(rows);
      const visibleRows = deduped.filter((row) => row.__visible === true).map((row) => ({ ...row, nativeRecentsMode: 'visible' }));
      return {
        rows: deduped,
        visibleRows,
        diagnostics: {
          nativeRecentsSectionFound: !!section,
          nativeRecentsExpanded: expanded == null ? !!deduped.length : !!expanded,
          nativeRecentsVisibleCount: visibleRows.length,
          nativeRecentsLoadedCount: deduped.length,
        },
      };
    }

    function listConversationHistoryCacheKeys() {
      const out = [];
      try {
        const box = W.localStorage;
        const len = Number(box?.length || 0);
        for (let i = 0; i < len; i += 1) {
          const key = String(box.key(i) || '');
          if (!key || !/\/conversation-history$/i.test(key)) continue;
          out.push(key);
        }
      } catch (e) {
        err('native-recents:cache-keys', e);
      }
      return out;
    }

    function collectNativeConversationHistoryCacheRows(observedAt = new Date().toISOString()) {
      const out = [];
      let declaredTotal = 0;
      const keys = listConversationHistoryCacheKeys();
      try {
        keys.forEach((key) => {
          const raw = W.localStorage?.getItem?.(key);
          if (!raw) return;
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
          const pages = Array.isArray(parsed?.value?.pages) ? parsed.value.pages : [];
          let globalIndex = 0;
          pages.forEach((page, pageIndex) => {
            const items = Array.isArray(page?.items) ? page.items : [];
            declaredTotal = Math.max(declaredTotal, Number(page?.total || 0) || 0);
            items.forEach((item, itemIndex) => {
              const chatId = normalizeChatId(item?.id || item?.conversationId || '');
              if (!chatId) return;
              const title = normText(item?.title || item?.snippet || chatId).slice(0, 220);
              if (!title) return;
              out.push({
                chatId,
                href: hrefForChatId(chatId),
                title,
                source: 'recents',
                create_time: item?.create_time || '',
                update_time: item?.update_time || '',
                pinned_time: item?.pinned_time || '',
                gizmo_id: item?.gizmo_id || '',
                is_archived: item?.is_archived === true,
                nativeOrder: globalIndex,
                observedAt,
                nativeRecentsMode: 'best-effort',
                nativeRecentsSource: 'conversation-history-cache',
                nativePageIndex: pageIndex,
                nativeItemIndex: itemIndex,
              });
              globalIndex += 1;
            });
          });
        });
      } catch (e) {
        err('native-recents:cache-rows', e);
      }
      return {
        rows: dedupeNativeRecentRows(out),
        diagnostics: {
          nativeConversationHistoryCacheFound: keys.length > 0,
          nativeRecentsCacheKeys: keys.length,
          nativeRecentsCacheCount: dedupeNativeRecentRows(out).length,
          nativeRecentsDeclaredTotal: declaredTotal,
        },
      };
    }

    function stripNativeRecentPrivateFields(rows = []) {
      return (Array.isArray(rows) ? rows : []).map((row) => {
        const next = { ...(row && typeof row === 'object' ? row : {}) };
        delete next.__visible;
        return next;
      });
    }

    function inspectNativeRecents(options = {}) {
      const opts = resolveNativeRecentOptions(options);
      const dom = collectNativeRecentDomRows(opts.observedAt);
      const cache = collectNativeConversationHistoryCacheRows(opts.observedAt);
      const bestEffortRows = dedupeNativeRecentRows([
        ...dom.rows.map((row) => ({ ...row, nativeRecentsMode: 'best-effort' })),
        ...cache.rows,
      ]);
      const mode = normalizeNativeRecentsMode(opts.mode);
      const rows = mode === 'visible'
        ? dom.visibleRows
        : mode === 'loaded'
          ? dom.rows
          : bestEffortRows;
      const completenessLevel = mode === 'visible' ? 'visible-only' : mode === 'loaded' ? 'loaded-dom' : 'best-effort';
      const diagnostics = {
        ...emptySourceStatus(mode),
        ...dom.diagnostics,
        ...cache.diagnostics,
        nativeRecents: !!(dom.rows.length || cache.rows.length || dom.diagnostics.nativeRecentsSectionFound),
        nativeRecentsBestEffortCount: bestEffortRows.length,
        nativeRecentsCollectionMode: mode,
        completenessLevel,
        chatHistoryCompleteness: completenessLevel,
        allChatHistoryAvailable: false,
      };
      state.lastNativeRecentsDiag = diagnostics;
      return { rows: stripNativeRecentPrivateFields(rows), diagnostics };
    }

    function listNativeRecentChats(options = null) {
      try {
        const rows = inspectNativeRecents(options).rows;
        if (options && typeof options === 'object' && options.persist === true) {
          mergeKnownChatRegistryRows(rows, { reason: normText(options.reason || 'list-native-recent-chats:persist') });
        }
        return rows;
      } catch (e) {
        err('native-recents:list', e);
      }
      return [];
    }

    function registrySortMs(row) {
      return dateMs(row?.updatedAt || row?.savedAt || row?.lastSeenAt || row?.createdAt || row?.observedAt || '');
    }

    function toKnownRegistryRow(raw, fallbackSource = 'indexed') {
      try {
        const source = raw?.source || raw?.originSource || fallbackSource;
        const normalized = normalizeChatRow(raw, source, { observedAt: raw?.observedAt || raw?.lastSeenAt || '' });
        if (!normalized?.id) return null;
        return {
          id: normalized.id,
          chatId: normalized.chatId || '',
          href: normalized.href || '',
          title: normalized.title || '',
          source: 'indexed',
          originSource: bestSource(raw?.originSources || raw?.sources || normalized.sources || raw?.originSource || raw?.source || ''),
          originSources: mergeSourceArrays(raw?.originSources || raw?.sources || normalized.sources || raw?.originSource || raw?.source || ''),
          isSavedHint: !!(raw?.isSavedHint || normalized.isSaved),
          isImportedHint: !!(raw?.isImportedHint || normalized.isImported),
          isArchived: !!(raw?.isArchived || normalized.isArchived),
          isPinned: !!(raw?.isPinned || normalized.isPinned),
          createdAt: normalized.createdAt || '',
          updatedAt: normalized.updatedAt || '',
          savedAt: normalized.savedAt || '',
          lastSeenAt: normalized.lastSeenAt || '',
          observedAt: normalized.observedAt || new Date().toISOString(),
          nativeOrder: Number.isFinite(Number(raw?.nativeOrder ?? normalized.nativeOrder)) ? Number(raw?.nativeOrder ?? normalized.nativeOrder) : null,
          nativeRecentsSource: normText(raw?.nativeRecentsSource || normalized.nativeRecentsSource || ''),
          projectId: normalized.projectId || '',
          projectName: normalized.projectName || '',
        };
      } catch (e) {
        err('known-registry:normalize', e);
        return null;
      }
    }

    function compactKnownRegistryRows(rows = []) {
      const map = new Map();
      (Array.isArray(rows) ? rows : []).forEach((raw) => {
        const row = toKnownRegistryRow(raw, 'indexed');
        if (!row) return;
        const key = row.chatId || row.href || row.id;
        if (!key) return;
        const prev = map.get(key) || null;
        if (!prev) {
          map.set(key, row);
          return;
        }
        const merged = mergeChatRecord(
          normalizeChatRow(prev, 'indexed', { observedAt: prev.observedAt || '' }),
          normalizeChatRow(row, 'indexed', { observedAt: row.observedAt || '' }),
        );
        map.set(key, toKnownRegistryRow(merged, 'indexed'));
      });
      return Array.from(map.values())
        .filter(Boolean)
        .sort((a, b) => registrySortMs(b) - registrySortMs(a) || String(a.title || '').localeCompare(String(b.title || '')))
        .slice(0, KNOWN_REGISTRY_ROW_LIMIT);
    }

    function readKnownChatRegistry() {
      const raw = storage.getJSON(KEY_KNOWN_REGISTRY_V1, null);
      if (!raw || typeof raw !== 'object') return null;
      const rows = compactKnownRegistryRows(raw.rows || []);
      return {
        version: 1,
        rows,
        updatedAt: Number(raw.updatedAt || 0) || 0,
        updatedAtIso: normText(raw.updatedAtIso || ''),
        reason: normText(raw.reason || ''),
      };
    }

    function readKnownChatRegistryRows() {
      const payload = readKnownChatRegistry();
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      state.lastKnownRegistryCount = rows.length;
      return rows.map((row) => ({ ...row, source: 'indexed' }));
    }

    function writeKnownChatRegistryRows(rows = [], meta = {}) {
      const compact = compactKnownRegistryRows(rows);
      const payload = {
        version: 1,
        rows: compact,
        updatedAt: Date.now(),
        updatedAtIso: new Date().toISOString(),
        reason: normText(meta.reason || ''),
      };
      const ok = storage.setJSON(KEY_KNOWN_REGISTRY_V1, payload);
      if (ok) state.lastKnownRegistryCount = compact.length;
      return ok ? payload : null;
    }

    function mergeKnownChatRegistryRows(rows = [], meta = {}) {
      const current = readKnownChatRegistryRows();
      return writeKnownChatRegistryRows([...(Array.isArray(current) ? current : []), ...(Array.isArray(rows) ? rows : [])], meta);
    }

    function persistKnownChatRegistryFromModel(model, reason = 'refresh') {
      const rows = Array.isArray(model?.chats) ? model.chats : (Array.isArray(model?.knownChats) ? model.knownChats : []);
      if (!rows.length) return null;
      return mergeKnownChatRegistryRows(rows, { reason });
    }

    function seedKnownChatRegistryFromModel(model, reason = 'seed') {
      const rows = Array.isArray(model?.chats) ? model.chats : (Array.isArray(model?.knownChats) ? model.knownChats : []);
      if (!rows.length) return null;
      return mergeKnownChatRegistryRows(rows, { reason });
    }

    function clearKnownChatRegistry() {
      state.lastKnownRegistryCount = 0;
      return storage.del(KEY_KNOWN_REGISTRY_V1);
    }

    function registerKnownChats(rows, opts = {}) {
      const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
      if (!list.length) return { ok: false, added: 0, count: state.lastKnownRegistryCount, storageKey: KEY_KNOWN_REGISTRY_V1 };
      const payload = mergeKnownChatRegistryRows(list, { reason: opts.reason || 'api-register-known-chats' });
      if (opts.refresh !== false) scheduleRefresh(opts.refreshReason || 'api:register-known-chats');
      return {
        ok: !!payload,
        added: list.length,
        count: Array.isArray(payload?.rows) ? payload.rows.length : state.lastKnownRegistryCount,
        storageKey: KEY_KNOWN_REGISTRY_V1,
      };
    }

    function safeListFolders(api = foldersApi()) {
      try {
        const rows = typeof api?.list === 'function' ? api.list() : (Array.isArray(api?.folders) ? api.folders : []);
        return (Array.isArray(rows) ? rows : []).map((row) => ({
          id: normText(row?.id || row?.folderId || ''),
          name: normText(row?.name || row?.title || row?.id || 'Folder'),
          createdAt: isoOrEmpty(row?.createdAt || ''),
          projectId: normText(row?.projectId || row?.nativeProjectId || ''),
          source: 'folders',
        })).filter((row) => row.id || row.name);
      } catch (e) {
        err('folders:list', e);
        return [];
      }
    }

    function safeGetFolderBinding(api, chatIdOrHref) {
      if (!api || !chatIdOrHref || typeof api.getBinding !== 'function') return null;
      try {
        const res = api.getBinding(chatIdOrHref);
        if (!res || typeof res !== 'object') return null;
        const folderId = normText(res.folderId || res.id || '');
        const folderName = normText(res.folderName || res.name || '');
        if (!folderId && !folderName) return null;
        return { id: folderId, name: folderName };
      } catch {
        return null;
      }
    }

    async function safeListProjects(api = projectsApi()) {
      if (!api) return [];
      try {
        let rows = [];
        if (typeof api.loadRowsFast === 'function') rows = api.loadRowsFast(null) || [];
        if (!rows.length && typeof api.loadRows === 'function') {
          const maybe = api.loadRows(null, { backgroundRefresh: false });
          rows = Array.isArray(maybe) ? maybe : (await maybe || []);
        }
        if (!rows.length && typeof api.list === 'function') rows = api.list() || [];
        return (Array.isArray(rows) ? rows : []).map((row) => ({
          id: normText(row?.id || row?.projectId || ''),
          name: normText(row?.title || row?.name || row?.label || row?.id || 'Project'),
          title: normText(row?.title || row?.name || row?.label || row?.id || 'Project'),
          href: normText(row?.href || row?.url || ''),
          source: normText(row?.source || 'projects'),
        })).filter((row) => row.id || row.href || row.title);
      } catch (e) {
        err('projects:list', e);
        return [];
      }
    }

    async function safeLoadCategoryGroups(upsert) {
      const api = categoriesApi();
      if (!api) return [];
      try {
        const maybe = api.loadGroups?.();
        const groups = Array.isArray(maybe) ? maybe : (await maybe || []);
        return (Array.isArray(groups) ? groups : []).map((group) => ({
          id: normText(group?.id || ''),
          name: normText(group?.name || group?.label || group?.id || 'Category'),
          color: normText(group?.color || ''),
          sortOrder: Number.isFinite(Number(group?.sortOrder)) ? Number(group.sortOrder) : 9999,
          rows: Array.isArray(group?.rows) ? group.rows.slice() : [],
          source: 'categories',
        })).filter((group) => group.id || group.name);
      } catch (e) {
        err('categories:loadGroups', e);
        return [];
      }
    }

    function safeListLabels(api = labelsApi()) {
      if (!api) return [];
      try {
        const types = typeof api.listTypes === 'function' ? api.listTypes() : [];
        const typeByKey = new Map((Array.isArray(types) ? types : []).map((row) => [String(row?.key || ''), row]));
        const catalog = typeof api.listCatalog === 'function' ? api.listCatalog() : {};
        const counts = typeof api.getLabelCounts === 'function' ? api.getLabelCounts() : {};
        const out = [];
        Object.keys(catalog || {}).forEach((type) => {
          const typeDef = typeByKey.get(type) || { key: type, label: type, fullLabel: type, cardinality: '' };
          (Array.isArray(catalog[type]) ? catalog[type] : []).forEach((record) => {
            const id = normText(record?.id || '');
            const label = normText(record?.label || record?.name || id || 'Label');
            out.push({
              key: `${type}:${id}`,
              id,
              label,
              name: label,
              type,
              typeLabel: normText(typeDef.fullLabel || typeDef.label || type),
              cardinality: normText(typeDef.cardinality || ''),
              color: normText(record?.color || ''),
              count: Number(counts?.[type]?.[id] || 0) || 0,
              source: 'labels',
            });
          });
        });
        return out;
      } catch (e) {
        err('labels:list', e);
        return [];
      }
    }

    function safeListLabelKnownChats(api = labelsApi()) {
      if (!api || typeof api.listKnownChats !== 'function') return [];
      try {
        const rows = api.listKnownChats();
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        err('labels:listKnownChats', e);
        return [];
      }
    }

    function enrichWithFolders(chats, folders) {
      const api = foldersApi();
      const byId = new Map((Array.isArray(folders) ? folders : []).map((folder) => [String(folder.id || ''), folder]));
      chats.forEach((chat) => {
        const binding = safeGetFolderBinding(api, chat.chatId || chat.href) || safeGetFolderBinding(api, chat.href || chat.chatId);
        if (!binding) return;
        const record = byId.get(binding.id) || binding;
        chat.folderIds = uniqueStrings([...(chat.folderIds || []), binding.id || record.id]);
        chat.folderNames = uniqueStrings([...(chat.folderNames || []), binding.name || record.name]);
      });
    }

    function enrichWithCategories(chats, groups) {
      const byChat = new Map();
      (Array.isArray(groups) ? groups : []).forEach((group) => {
        (Array.isArray(group?.rows) ? group.rows : []).forEach((row) => {
          const chatId = normalizeChatId(row?.chatId || row?.href || row?.url || '');
          const href = normText(row?.href || row?.url || '');
          const keys = uniqueStrings([chatId, href]);
          keys.forEach((key) => {
            if (!key) return;
            const arr = byChat.get(key) || [];
            if (!arr.some((item) => item.id === group.id)) arr.push({ id: group.id, name: group.name, label: group.name, color: group.color });
            byChat.set(key, arr);
          });
        });
      });
      chats.forEach((chat) => {
        const cats = [...(byChat.get(chat.chatId) || []), ...(byChat.get(chat.href) || [])];
        chat.categories = mergeObjectsById(chat.categories, cats, ['id'], ['name', 'label']);
      });
    }

    function enrichWithLabels(chats, api, labelCatalog) {
      if (!api) return;
      const catalogByKey = new Map((Array.isArray(labelCatalog) ? labelCatalog : []).map((row) => [`${row.type}:${row.id}`, row]));
      chats.forEach((chat) => {
        const chatId = chat.chatId;
        if (!chatId) return;
        let labels = [];
        try {
          const flat = typeof api.flattenChatLabels === 'function' ? api.flattenChatLabels(chatId) : [];
          if (Array.isArray(flat) && flat.length) {
            labels = flat.map((item) => {
              const type = normText(item?.type || '');
              const id = normText(item?.id || item?.label || '');
              const catalog = catalogByKey.get(`${type}:${id}`) || null;
              const label = normText(item?.label || catalog?.label || id);
              return { key: `${type}:${id}`, id, label, name: label, type, typeLabel: normText(item?.typeLabel || catalog?.typeLabel || type), color: normText(item?.color || catalog?.color || '') };
            }).filter((item) => item.id || item.label);
          } else if (typeof api.getChatLabels === 'function') {
            const row = api.getChatLabels(chatId) || {};
            Object.keys(row || {}).forEach((type) => {
              const values = Array.isArray(row[type]) ? row[type] : (row[type] ? [row[type]] : []);
              values.forEach((idRaw) => {
                const id = normText(idRaw);
                const catalog = catalogByKey.get(`${type}:${id}`) || null;
                const label = normText(catalog?.label || id);
                if (!id && !label) return;
                labels.push({ key: `${type}:${id}`, id, label, name: label, type, typeLabel: normText(catalog?.typeLabel || type), color: normText(catalog?.color || '') });
              });
            });
          }
        } catch (e) {
          err(`labels:chat:${chatId}`, e);
        }
        chat.labels = mergeObjectsById(chat.labels, labels, ['key', 'id'], ['label', 'name']);
      });
    }

    function enrichWithTags(chats, api) {
      chats.forEach((chat) => {
        const chatId = chat.chatId;
        const tags = [];
        const keywords = [];
        if (Array.isArray(chat.tagCatalog)) tags.push(...chat.tagCatalog);
        if (Array.isArray(chat.tags)) tags.push(...chat.tags);
        if (Array.isArray(chat.keywords)) keywords.push(...chat.keywords);
        if (api && chatId) {
          try {
            const summary = typeof api.getChatSummary === 'function' ? api.getChatSummary(chatId) : null;
            if (Array.isArray(summary?.tags)) tags.push(...summary.tags.map((label) => ({ id: slug(label), label })));
            if (Array.isArray(summary?.tagCatalog)) tags.push(...summary.tagCatalog);
            if (Array.isArray(summary?.keywords)) keywords.push(...summary.keywords);
          } catch {}
          try {
            const catalog = typeof api.getChatTagCatalog === 'function' ? api.getChatTagCatalog(chatId) : [];
            if (Array.isArray(catalog)) tags.push(...catalog);
          } catch {}
        }
        chat.tags = mergeObjectsById(chat.tags, tags.map((tag) => ({
          id: normText(tag?.id || slug(tag?.label || tag?.name || tag)),
          label: normText(tag?.label || tag?.name || tag?.id || tag),
          color: normText(tag?.color || ''),
          usageCount: Number(tag?.usageCount || 0) || 0,
        })), ['id'], ['label', 'name']);
        chat.keywords = uniqueStrings([...(chat.keywords || []), ...keywords]);
      });
    }

    function enrichWithProjects(chats, projects) {
      const projectRows = Array.isArray(projects) ? projects : [];
      chats.forEach((chat) => {
        if (chat.projectName || chat.projectId) return;
        const href = normText(chat.href || '');
        if (!href) return;
        const match = projectRows.find((project) => project.href && href.includes(project.href));
        if (!match) return;
        chat.projectId = match.id || '';
        chat.projectName = match.title || match.name || '';
      });
    }

    function finalizeChats(chats) {
      chats.forEach((chat) => {
        chat.sources = mergeSourceArrays(chat.sources || chat.source);
        chat.source = bestSource(chat.sources);
        chat.labelIds = uniqueStrings((chat.labels || []).map((item) => item.key || item.id || item.label));
        chat.labelNames = uniqueStrings((chat.labels || []).map((item) => item.label || item.name || item.id));
        chat.categoryIds = uniqueStrings((chat.categories || []).map((item) => item.id || item.label || item.name));
        chat.categoryNames = uniqueStrings((chat.categories || []).map((item) => item.name || item.label || item.id));
        chat.tagIds = uniqueStrings((chat.tags || []).map((item) => item.id || item.label || item.name));
        chat.tagNames = uniqueStrings((chat.tags || []).map((item) => item.label || item.name || item.id));
        chat.folderId = chat.folderIds?.[0] || '';
        chat.folderName = chat.folderNames?.[0] || '';
        chat.labelText = chat.labelNames.join(', ');
        chat.categoryText = chat.categoryNames.join(', ');
        chat.tagText = chat.tagNames.join(', ');
        chat.sourceText = chat.sources.join(', ');
        chat.searchText = uniqueStrings([
          chat.title, chat.chatId, chat.href, chat.sourceText, chat.folderNames.join(' '), chat.labelText,
          chat.categoryText, chat.projectName, chat.tagText, chat.keywords.join(' '),
        ]).join(' ').toLowerCase();
        chat.sortAt = pickNewerDate(chat.updatedAt, pickNewerDate(chat.savedAt, pickNewerDate(chat.lastSeenAt, chat.observedAt)));
        chat.dates = {
          createdAt: chat.createdAt || '',
          updatedAt: chat.updatedAt || '',
          savedAt: chat.savedAt || '',
          lastSeenAt: chat.lastSeenAt || '',
          observedAt: chat.observedAt || '',
          sortAt: chat.sortAt || '',
        };
      });
    }

    function normalizeCategoryList(groups, chats) {
      const countById = new Map();
      (Array.isArray(chats) ? chats : []).forEach((chat) => (chat.categories || []).forEach((cat) => {
        const id = normText(cat.id || cat.name || cat.label);
        if (!id) return;
        countById.set(id, (countById.get(id) || 0) + 1);
      }));
      return (Array.isArray(groups) ? groups : []).map((group) => ({
        id: group.id,
        name: group.name,
        label: group.name,
        color: group.color || '',
        count: countById.get(group.id) || (Array.isArray(group.rows) ? group.rows.length : 0),
        source: 'categories',
      })).sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
    }

    function collectTagFacets(chats) {
      const map = new Map();
      (Array.isArray(chats) ? chats : []).forEach((chat) => {
        (chat.tags || []).forEach((tag) => {
          const id = normText(tag.id || slug(tag.label || tag.name));
          const label = normText(tag.label || tag.name || id);
          if (!id && !label) return;
          const key = (id || label).toLowerCase();
          const current = map.get(key) || { id, label, name: label, color: tag.color || '', count: 0, usageCount: 0, source: 'tags' };
          current.count += 1;
          current.usageCount += Number(tag.usageCount || 0) || 0;
          if (!current.color && tag.color) current.color = tag.color;
          map.set(key, current);
        });
      });
      return Array.from(map.values()).sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
    }

    function buildCounts(model) {
      const saved = model.savedChats || [];
      const chats = model.chats || [];
      const recentChats = model.recentChats || [];
      return {
        knownChats: chats.length,
        savedChats: saved.length,
        recentChats: recentChats.length,
        nativeRecentChats: recentChats.length,
        importedChats: chats.filter((chat) => chat.isImported).length,
        folders: (model.folders || []).length,
        labels: (model.labels || []).length,
        categories: (model.categories || []).length,
        projects: (model.projects || []).length,
        tags: (model.tags || []).length,
        undated: chats.filter((chat) => !dateMs(chat.sortAt)).length,
        unfiledSaved: saved.filter((chat) => !(chat.folderIds || []).length).length,
        unlabeledSaved: saved.filter((chat) => !(chat.labels || []).length).length,
        uncategorizedSaved: saved.filter((chat) => !(chat.categories || []).length).length,
      };
    }

    function facetRowsFromMap(map) {
      return Array.from(map.values()).sort((a, b) => (b.count - a.count) || String(a.label || a.id).localeCompare(String(b.label || b.id)));
    }

    function bumpFacet(map, idRaw, labelRaw = idRaw, extra = {}) {
      const id = normText(idRaw || labelRaw);
      const label = normText(labelRaw || id);
      if (!id && !label) return;
      const key = (id || label).toLowerCase();
      const row = map.get(key) || { id, label, count: 0, ...extra };
      row.count += 1;
      map.set(key, row);
    }

    function buildFacets(chats, model = null) {
      const sourceMap = new Map();
      const folderMap = new Map();
      const labelMap = new Map();
      const categoryMap = new Map();
      const projectMap = new Map();
      const tagMap = new Map();
      const yearMap = new Map();
      const monthMap = new Map();

      (Array.isArray(chats) ? chats : []).forEach((chat) => {
        (chat.sources || []).forEach((source) => bumpFacet(sourceMap, source, source));
        (chat.folderIds || []).forEach((id, idx) => bumpFacet(folderMap, id, chat.folderNames?.[idx] || id));
        (chat.labels || []).forEach((label) => bumpFacet(labelMap, label.key || label.id, label.label || label.name || label.id, { type: label.type || '' }));
        (chat.categories || []).forEach((cat) => bumpFacet(categoryMap, cat.id, cat.name || cat.label || cat.id));
        if (chat.projectId || chat.projectName) bumpFacet(projectMap, chat.projectId || chat.projectName, chat.projectName || chat.projectId);
        (chat.tags || []).forEach((tag) => bumpFacet(tagMap, tag.id || tag.label, tag.label || tag.name || tag.id));
        const ms = dateMs(chat.sortAt);
        if (ms) {
          const d = new Date(ms);
          const year = String(d.getUTCFullYear());
          const month = `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          bumpFacet(yearMap, year, year);
          bumpFacet(monthMap, month, month);
        }
      });

      return {
        sources: facetRowsFromMap(sourceMap),
        folders: facetRowsFromMap(folderMap),
        labels: facetRowsFromMap(labelMap),
        categories: facetRowsFromMap(categoryMap),
        projects: facetRowsFromMap(projectMap),
        tags: facetRowsFromMap(tagMap),
        years: facetRowsFromMap(yearMap),
        months: facetRowsFromMap(monthMap),
      };
    }

    function matchesOne(value, candidates = []) {
      if (value == null || value === '' || value === 'all') return true;
      const vals = Array.isArray(value) ? value : [value];
      const lookup = new Set((Array.isArray(candidates) ? candidates : [candidates]).map((v) => normText(v).toLowerCase()).filter(Boolean));
      return vals.some((raw) => lookup.has(normText(raw).toLowerCase()));
    }

    function filterChats(chats, filters = {}) {
      const f = filters && typeof filters === 'object' ? filters : {};
      const q = normText(f.q || f.search || '').toLowerCase();
      const source = f.source || f.sources || '';
      const folder = f.folder || f.folderId || f.folderName || '';
      const label = f.label || f.labelId || f.labelName || '';
      const category = f.category || f.categoryId || f.categoryName || '';
      const project = f.project || f.projectId || f.projectName || '';
      const tag = f.tag || f.tagId || f.tagName || '';
      const missing = normText(f.missing || '').toLowerCase();
      const includeArchived = f.includeArchived === true;
      const dateField = f.dateField || 'sortAt';
      const startMs = dateMs(f.start || f.dateStart || f.from || '');
      const endMs = dateMs(f.end || f.dateEnd || f.to || '');

      return (Array.isArray(chats) ? chats : []).filter((chat) => {
        if (!includeArchived && chat.isArchived) return false;
        if (q && !String(chat.searchText || '').includes(q)) return false;
        if (source && !matchesOne(source, chat.sources || chat.source)) return false;
        if (folder && !matchesOne(folder, [...(chat.folderIds || []), ...(chat.folderNames || [])])) return false;
        if (label && !matchesOne(label, [...(chat.labelIds || []), ...(chat.labelNames || [])])) return false;
        if (category && !matchesOne(category, [...(chat.categoryIds || []), ...(chat.categoryNames || [])])) return false;
        if (project && !matchesOne(project, [chat.projectId, chat.projectName])) return false;
        if (tag && !matchesOne(tag, [...(chat.tagIds || []), ...(chat.tagNames || [])])) return false;
        if (missing === 'folder' && (chat.folderIds || []).length) return false;
        if (missing === 'label' && (chat.labels || []).length) return false;
        if (missing === 'category' && (chat.categories || []).length) return false;
        const ms = dateMs(readDateField(chat, dateField));
        if (startMs && (!ms || ms < startMs)) return false;
        if (endMs && (!ms || ms > endMs)) return false;
        return true;
      });
    }

    function sortChats(chats, sort = 'newest', dateField = 'sortAt') {
      const rows = (Array.isArray(chats) ? chats : []).slice();
      const s = String(sort || 'newest').toLowerCase();
      rows.sort((a, b) => {
        if (s === 'oldest') return -compareDateDesc(a, b, dateField) || String(a.title || '').localeCompare(String(b.title || ''));
        if (s === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        if (s === 'source') return String(a.source || '').localeCompare(String(b.source || '')) || compareDateDesc(a, b, dateField);
        if (s === 'category') return String(a.categoryText || '').localeCompare(String(b.categoryText || '')) || compareDateDesc(a, b, dateField);
        if (s === 'label') return String(a.labelText || '').localeCompare(String(b.labelText || '')) || compareDateDesc(a, b, dateField);
        return compareDateDesc(a, b, dateField) || String(a.title || '').localeCompare(String(b.title || ''));
      });
      return rows;
    }

    function bucketKey(value, bucket = 'month') {
      const ms = dateMs(value);
      if (!ms) return '';
      const d = new Date(ms);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const b = String(bucket || 'month').toLowerCase();
      if (b === 'day') return `${year}-${month}-${day}`;
      if (b === 'week') return isoWeekKey(d);
      if (b === 'year') return String(year);
      return `${year}-${month}`;
    }

    function isoWeekKey(date) {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    }

    function bucketLabel(key, bucket = 'month') {
      if (!key) return 'Undated';
      const b = String(bucket || 'month').toLowerCase();
      if (b === 'month' && /^\d{4}-\d{2}$/.test(key)) {
        const [year, month] = key.split('-').map(Number);
        try { return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }); } catch { return key; }
      }
      return key;
    }

    function getActiveModel() {
      if (state.model?.ok) return state.model;
      const cached = readCache();
      if (cached?.ok) {
        state.model = cached;
        return cached;
      }
      return buildEmptyModel('no-model');
    }

    function getDateBuckets(options = {}) {
      const opts = options && typeof options === 'object' ? options : {};
      const bucket = String(opts.bucket || opts.groupBy || 'month').toLowerCase();
      const dateField = String(opts.dateField || 'sortAt');
      const rows = listChats(opts.filters || opts, { sort: 'newest', dateField });
      const map = new Map();
      let undated = 0;
      rows.forEach((chat) => {
        const key = bucketKey(readDateField(chat, dateField), bucket);
        if (!key) { undated += 1; return; }
        const item = map.get(key) || { key, label: bucketLabel(key, bucket), count: 0, chatIds: [] };
        item.count += 1;
        item.chatIds.push(chat.chatId || chat.id || chat.href);
        map.set(key, item);
      });
      const out = Array.from(map.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
      if (undated) out.push({ key: 'undated', label: 'Undated', count: undated, chatIds: [] });
      return out;
    }

    function getStats(options = {}) {
      const opts = options && typeof options === 'object' ? options : {};
      const filters = opts.filters || opts;
      const dateField = opts.dateField || 'sortAt';
      const bucket = opts.bucket || opts.groupBy || 'month';
      const chats = listChats(filters, { sort: opts.sort || 'newest', dateField });
      const partialModel = { ...getActiveModel(), chats };
      const facets = buildFacets(chats, partialModel);
      return {
        ok: true,
        generatedAt: Date.now(),
        generatedAtIso: new Date().toISOString(),
        filters,
        dateField,
        bucket,
        counts: {
          knownChats: chats.length,
          savedChats: chats.filter((chat) => chat.isSaved).length,
          recentChats: chats.filter((chat) => chat.isRecent).length,
          nativeRecentChats: chats.filter((chat) => chat.isRecent).length,
          importedChats: chats.filter((chat) => chat.isImported).length,
          undated: chats.filter((chat) => !dateMs(readDateField(chat, dateField))).length,
        },
        dateBuckets: getDateBuckets({ filters, dateField, bucket }),
        sourceDistribution: facets.sources,
        categoryDistribution: facets.categories,
        labelDistribution: facets.labels,
        folderDistribution: facets.folders,
        projectDistribution: facets.projects,
        tagDistribution: facets.tags,
        facets,
      };
    }

    function listChats(filters = {}, options = {}) {
      const model = getActiveModel();
      const rows = filterChats(model.chats || [], filters);
      return sortChats(rows, options.sort || filters.sort || 'newest', options.dateField || filters.dateField || 'sortAt');
    }

    function getChat(chatIdOrHref) {
      const key = normText(chatIdOrHref);
      if (!key) return null;
      const chatId = normalizeChatId(key);
      return (getActiveModel().chats || []).find((chat) => chat.chatId === chatId || chat.href === key || chat.id === key) || null;
    }

    function getFacets(filters = null) {
      if (filters && typeof filters === 'object' && Object.keys(filters).length) {
        return buildFacets(listChats(filters), getActiveModel());
      }
      return getActiveModel().facets || emptyFacets();
    }

    function readPrefs() {
      const raw = storage.getJSON(KEY_PREFS_V1, null);
      const src = raw && typeof raw === 'object' ? raw : {};
      return {
        autoRefresh: src.autoRefresh !== false,
        refreshDebounceMs: clampInt(src.refreshDebounceMs, 150, 8000, 900),
        cacheTtlMs: clampInt(src.cacheTtlMs, 0, 24 * 60 * 60 * 1000, 10 * 60 * 1000),
        defaultBucket: ['day', 'week', 'month', 'year'].includes(src.defaultBucket) ? src.defaultBucket : 'month',
        defaultDateField: ['sortAt', 'savedAt', 'updatedAt', 'lastSeenAt', 'createdAt', 'observedAt'].includes(src.defaultDateField) ? src.defaultDateField : 'sortAt',
      };
    }

    function writePrefs(patch = {}) {
      const next = { ...readPrefs(), ...(patch && typeof patch === 'object' ? patch : {}), updatedAt: Date.now() };
      storage.setJSON(KEY_PREFS_V1, next);
      return readPrefs();
    }

    function clampInt(v, min, max, fallback) {
      const n = Number.parseInt(String(v ?? ''), 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    }

    function writeCache(model) {
      const safe = sanitizeForCache(model);
      return storage.setJSON(KEY_CACHE_V1, safe);
    }

    function sanitizeForCache(model) {
      const src = model && typeof model === 'object' ? model : buildEmptyModel('cache-empty');
      return {
        ...src,
        cacheWrittenAt: Date.now(),
      };
    }

    function readCache() {
      const cached = storage.getJSON(KEY_CACHE_V1, null);
      if (!cached || typeof cached !== 'object' || cached.version !== 1) return null;
      return cached;
    }

    function isCacheFresh(model = readCache()) {
      if (!model?.cacheWrittenAt) return false;
      const ttl = readPrefs().cacheTtlMs;
      if (!ttl) return true;
      return Date.now() - Number(model.cacheWrittenAt || 0) <= ttl;
    }

    async function refresh(reason = 'api', opts = {}) {
      if (state.refreshPromise && opts.force !== true) return state.refreshPromise;
      state.refreshPromise = Promise.resolve().then(async () => {
        step('refresh:start', reason);
        const model = await buildModel(reason);
        state.model = model;
        state.lastRefreshAt = Date.now();
        persistKnownChatRegistryFromModel(model, reason);
        writeCache(model);
        dispatchUpdated(reason, model);
        step('refresh:done', `${model.counts.knownChats} known / ${model.durationMs}ms`);
        return model;
      }).catch((e) => {
        err('refresh', e);
        const fallback = readCache() || buildEmptyModel('refresh-error');
        fallback.ok = false;
        fallback.error = String(e?.message || e || 'refresh failed');
        state.model = fallback;
        return fallback;
      }).finally(() => {
        state.refreshPromise = null;
      });
      return state.refreshPromise;
    }

    function scheduleRefresh(reason = 'schedule') {
      if (!readPrefs().autoRefresh) return false;
      const delay = readPrefs().refreshDebounceMs;
      if (state.scheduledRefreshTimer) {
        try { W.clearTimeout(state.scheduledRefreshTimer); } catch {}
        state.clean.timers.delete(state.scheduledRefreshTimer);
      }
      state.scheduledRefreshTimer = W.setTimeout(() => {
        state.clean.timers.delete(state.scheduledRefreshTimer);
        state.scheduledRefreshTimer = 0;
        refresh(reason).catch((e) => err(`scheduled-refresh:${reason}`, e));
      }, delay);
      state.clean.timers.add(state.scheduledRefreshTimer);
      evt('refresh:scheduled', reason);
      return true;
    }

    function clearCache() {
      storage.del(KEY_CACHE_V1);
      state.model = null;
      return true;
    }

    function dispatchUpdated(reason, model) {
      try {
        W.dispatchEvent(new CustomEvent(EV_UPDATED, {
          detail: {
            reason,
            counts: model?.counts || null,
            builtAt: model?.builtAt || Date.now(),
            durationMs: model?.durationMs || 0,
          },
        }));
      } catch {}
    }

    function bindEventsOnce() {
      if (state.listenersBound) return;
      state.listenersBound = true;
      const bind = (target, name, fn, opts = true) => {
        try {
          target.addEventListener(name, fn, opts);
          state.clean.listeners.add(() => target.removeEventListener(name, fn, opts));
        } catch {}
      };

      bind(W, EV_REFRESH_REQUEST, () => scheduleRefresh('event:refresh-request'), true);
      bind(W, 'evt:h2o:labels:changed', () => scheduleRefresh('event:labels-changed'), true);
      bind(W, 'evt:h2o:labels:assigned', () => scheduleRefresh('event:labels-assigned'), true);
      bind(W, 'evt:h2o:tags:changed', () => scheduleRefresh('event:tags-changed'), true);
      bind(W, 'evt:h2o:tags:chat-analyzed', () => scheduleRefresh('event:tags-analyzed'), true);
      bind(W, 'evt:h2o:folders:changed', () => scheduleRefresh('event:folders-changed'), true);
      bind(W, 'evt:h2o:core:index:updated', () => scheduleRefresh('event:core-index-updated'), true);
      bind(W, 'popstate', () => scheduleRefresh('event:popstate'), true);
      bind(W, 'hashchange', () => scheduleRefresh('event:hashchange'), true);
      bind(W, 'storage', (event) => {
        const key = String(event?.key || '');
        if (/h2o:prm:cgx:(labels|fldrs|tags|library|library-index)|h2o:folders/i.test(key) || /\/conversation-history$/i.test(key)) {
          scheduleRefresh(`storage:${key.slice(0, 48)}`);
        }
      }, true);
    }

    function registerWithCore() {
      const core = coreNow();
      if (!core) return false;
      try {
        core.registerOwner?.('library-index', owner, { replace: true });
        core.registerService?.('library-index', owner, { replace: true });
        core.registerView?.('library-index', owner, { replace: true });
        step('registered-with-library-core');
        return true;
      } catch (e) {
        err('register-with-core', e);
        return false;
      }
    }

    function selfCheck() {
      const core = coreNow();
      const model = getActiveModel();
      return {
        ok: !!core?.getOwner?.('library-index') && !!core?.getService?.('library-index'),
        hasCore: !!core,
        registeredOwner: !!core?.getOwner?.('library-index'),
        registeredService: !!core?.getService?.('library-index'),
        registeredView: !!core?.getView?.('library-index'),
        modelReady: !!state.model?.ok,
        cacheReady: !!readCache(),
        cacheFresh: isCacheFresh(),
        refreshRunning: !!state.refreshPromise,
        lastRefreshAt: state.lastRefreshAt,
        sourceStatus: sourceStatus(),
        counts: model?.counts || null,
        registryReady: !!readKnownChatRegistry()?.rows?.length,
        registryCount: Array.isArray(readKnownChatRegistry()?.rows) ? readKnownChatRegistry().rows.length : 0,
        storageKeys: { cache: KEY_CACHE_V1, knownRegistry: KEY_KNOWN_REGISTRY_V1, prefs: KEY_PREFS_V1 },
        prefs: readPrefs(),
        bootDiag: H2O.LibraryIndexBootDiag || null,
        diag: {
          steps: diag.steps.slice(-14),
          events: diag.events.slice(-10),
          errors: diag.errors.slice(-10),
        },
      };
    }

    const owner = {
      phase: 'phase-1-index-foundation',
      refresh(reason = 'api', opts = {}) { return refresh(reason, opts); },
      scheduleRefresh(reason = 'api') { return scheduleRefresh(reason); },
      getModel(opts = {}) {
        const cached = getActiveModel();
        if (opts.refresh === true) return refresh('getModel:refresh', { force: opts.force === true });
        return cached;
      },
      buildModel(reason = 'api') { return buildModel(reason); },
      listChats(filters = {}, options = {}) { return listChats(filters, options); },
      getChat(chatIdOrHref) { return getChat(chatIdOrHref); },
      getFacets(filters = null) { return getFacets(filters); },
      getStats(options = {}) { return getStats(options); },
      getDateBuckets(options = {}) { return getDateBuckets(options); },
      getSourceStatus() { return sourceStatus(); },
      getPrefs() { return readPrefs(); },
      setPrefs(patch = {}) { return writePrefs(patch); },
      clearCache() { return clearCache(); },
      resetCache() { return clearCache(); },
      readKnownChatRegistry() { return readKnownChatRegistry(); },
      clearKnownChatRegistry() { return clearKnownChatRegistry(); },
      registerKnownChats(rows, opts = {}) { return registerKnownChats(rows, opts); },
      readCache() { return readCache(); },
      isCacheFresh() { return isCacheFresh(); },
      listNativeRecentChats(options = null) { return listNativeRecentChats(options); },
      selfCheck() { return selfCheck(); },
    };

    function exposePublicApi() {
      MOD.owner = owner;
      Object.keys(owner).forEach((key) => {
        if (typeof owner[key] === 'function') MOD[key] = (...args) => owner[key](...args);
      });
      MOD.constants = Object.freeze({
        KEY_CACHE_V1,
        KEY_KNOWN_REGISTRY_V1,
        KEY_PREFS_V1,
        EV_UPDATED,
        EV_REFRESH_REQUEST,
        TOK,
        PID,
        SkID,
      });
    }

    function boot() {
      if (state.booted) return;
      state.booted = true;
      exposePublicApi();
      registerWithCore();
      bindEventsOnce();

      const cached = readCache();
      if (cached?.ok) {
        state.model = cached;
        seedKnownChatRegistryFromModel(cached, 'boot-cache-seed');
      }
      if (!cached || !isCacheFresh(cached)) scheduleRefresh('boot');
      else step('boot:using-fresh-cache', `${cached.counts?.knownChats || 0} known`);

      // Register again shortly after boot because some 0F modules may register late.
      const late = W.setTimeout(() => {
        state.clean.timers.delete(late);
        registerWithCore();
        if (!state.model?.ok) scheduleRefresh('late-boot');
      }, 900);
      state.clean.timers.add(late);

      step('booted');
    }

    boot();
  }

  bootWhenLibraryCoreReady();
})();
