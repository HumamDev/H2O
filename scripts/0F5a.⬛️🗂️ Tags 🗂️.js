// ==UserScript==
// @h2o-id             0f5a.tags
// @name               0F5a.⬛️🗂️ Tags 🗂️
// @namespace          H2O.Premium.CGX.tags
// @author             HumamDev
// @version            1.3.1
// @revision           001
// @build              260424-000001
// @description        Tags: feature-owner module. Owns turn-level tags/keywords, chat-level aggregation, manual overrides, and title-bar tag UI. Projects chat-level tag/keyword metadata into archive/workbench truth when archive write APIs are available.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F5a — Tags (feature-owner module)
   *
   * OWNS:
   *   - turn-level keyword extraction
   *   - turn-level visible tags
   *   - manual tag overrides (add/remove/pin/hide)
   *   - chat-level aggregation of tags + keywords
   *   - native turn title-bar tag tray UI
   *   - tag browsing / tag usage viewer APIs
   *
   * MUST NOT OWN:
   *   - folder bindings or folder data (0F3a)
   *   - category catalog / category viewer / category grouping (0F4a)
   *   - archive/workbench canonical row construction (0D3a)
   *   - title editing / title collapse behavior (1C1a)
   *   - shared route/page-host/ui-shell/native-sidebar services (0F1a)
   *
   * EXPOSES:
   *   - H2O.Tags
   *   - registers 'tags' owner + service in H2O.LibraryCore
   *
   * IMPORTANT:
   *   - No route is registered in v1. This module owns viewer-capable public APIs,
   *     but route registration is intentionally deferred until the viewer is tested.
   *   - Chat-level metadata projection is live. archiveBoot.upsertLatestSnapshotMeta is
   *     available (0D3a exposes it). A runtime guard in projectChatMetadata() still handles
   *     load-order races safely.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  const core = H2O.LibraryCore;
  if (!core) return;

  const MOD = (H2O.Tags = H2O.Tags || {});
  MOD.meta = MOD.meta || {
    owner: '0F5a.tags',
    label: 'Tags',
    phase: 'phase-3-tags-browsing-owner',
  };
  MOD.meta.phase = 'phase-3-tags-browsing-owner';

  const diag = (MOD.diag = MOD.diag || {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 180,
    errMax: 40,
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

  const TOK = 'TG';
  const PID = 'tags';
  const CID = 'tags';
  const SkID = 'tgsg';
  const MODTAG = 'Tags';
  const SUITE = 'prm';
  const HOST = 'cgx';
  const DsID = PID;
  const BrID = PID;

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const KEY_TURN_CACHE_PREFIX = `${NS_DISK}:turn-cache:v1:`;
  const KEY_CHAT_CACHE_PREFIX = `${NS_DISK}:chat-cache:v1:`;
  const KEY_MANUAL_PREFIX = `${NS_DISK}:manual:v1:`;
  const KEY_CFG = `${NS_DISK}:cfg:v1`;

  const KEY_TAG_POOL_PREFIX = `${NS_DISK}:tag-pool:v1:`;
  const KEY_TURN_CACHE_V2 = `${NS_DISK}:turn-cache:v2`;
  const KEY_CHAT_CACHE_V2 = `${NS_DISK}:chat-cache:v2`;
  const KEY_TAG_POOL_V2 = `${NS_DISK}:tag-pool:v2`;
  const KEY_CHAT_MODE_PREFIX = `${NS_DISK}:chat-mode:v1:`;
  const KEY_SUGGESTIONS_PREFIX = `${NS_DISK}:suggestions:v1:`;
  const TAG_MODE_MANUAL = 'manual';
  const TAG_MODE_SUGGESTION = 'suggestion';
  const TAG_MODE_AUTO = 'auto';
  // Phase 4 — Tag candidate pool + occurrence index. These live in the durable Library
  // Store namespace (h2o:prm:cgx:library:*), NOT in the per-chat tag-pool/manual stores
  // above. They're SIDE-OUTPUTS of aggregateChat — fire-and-forget writes through the
  // bridge, never blocking existing tag/manual behavior. No UI consumes them yet (Phase 5+).
  const NS_LIBRARY_STORE = `h2o:${SUITE}:${HOST}:library`;
  const KEY_TAG_AUTO_POOL = `${NS_LIBRARY_STORE}:tag-auto-pool:v1`;
  const KEY_TAG_OCC_INDEX_PREFIX = `${NS_LIBRARY_STORE}:tag-occ-index:v1:`;
  const TAG_AUTO_POOL_ALGO_VERSION = 'kw-v1';
  const TAG_AUTO_POOL_FLUSH_DEBOUNCE_MS = 200;
  const TAG_AUTO_POOL_CHATS_PER_PHRASE_CAP = 50;
  const TAG_AUTO_POOL_MAX_PHRASES = 10000;
  const TAG_OCC_INDEX_TURNS_PER_PHRASE_CAP = 100;
  const TAG_OCC_INDEX_MIN_FREQ_ON_SHRINK = 2;
  const EV_TAG_AUTO_POOL_UPDATED = 'evt:h2o:library:tag-auto-pool-updated';
  const EV_TAG_OCC_INDEX_UPDATED = 'evt:h2o:library:tag-occ-index-updated';
  const EV_TAG_OCC_INDEX_OVERSIZE = 'evt:h2o:library:tag-occ-index-oversize';

  const TAG_COLOR_PALETTE = Object.freeze([
    '#3B82F6', '#22C55E', '#A855F7', '#F472B6', '#FF914D', '#FFD54F', '#7DD3FC', '#14B8A6', '#F97316', '#8B5CF6', '#84CC16', '#EF4444'
  ]);

  const EV_TURN_ANALYZED = 'evt:h2o:tags:turn-analyzed';
  const EV_CHAT_ANALYZED = 'evt:h2o:tags:chat-analyzed';
  const EV_TURN_UI_OPEN = 'evt:h2o:tags:turn-ui-open';
  const EV_TURN_UI_CLOSE = 'evt:h2o:tags:turn-ui-close';
  const EV_TAGS_CHANGED = 'evt:h2o:tags:changed';

  const ATTR_CGXUI = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_CGXUI_MODE = 'data-cgxui-mode';
  const ATTR_CGXUI_PAGE_HIDDEN = 'data-cgxui-page-hidden-by';
  const ATTR_TURN_ID = 'data-h2o-turn-id';
  const ATTR_ANSWER_ID = 'data-h2o-answer-id';
  const ATTR_CHAT_ID = 'data-h2o-chat-id';

  const UI_TAG_PILL = `${SkID}-pill`;
  const UI_TAG_TRAY = `${SkID}-tray`;
  const UI_TAG_CHIP = `${SkID}-chip`;
  const UI_TAG_EDIT = `${SkID}-edit`;
  const UI_TAG_ADD_DOT = `${SkID}-add-dot`;
  const UI_TAG_POP = `${SkID}-pool-pop`;
  const UI_TAG_ACTIONS = `${SkID}-actions`;
  const UI_TAG_EMPTY = `${SkID}-empty`;
  const UI_FSECTION_VIEWER = `${SkID}-viewer`;
  const UI_FSECTION_PAGE_HOST = `${SkID}-page-host`;
  const UI_FSECTION_PAGE = `${SkID}-page`;
  const CSS_STYLE_ID = `cgxui-${SkID}-style`;
  const TAG_USAGE_STYLE_ID = `cgxui-${SkID}-usage-style`;

  const SVG_TAG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7.5h.01M3 9.5l11 11a2.12 2.12 0 0 0 3 0l5-5a2.12 2.12 0 0 0 0-3L11 1.5H3v8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const SVG_CHEVRON_DOWN = `<svg viewBox="0 0 16 16" aria-hidden="true" style="width:14px;height:14px;display:block;"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const CFG_DEFAULTS = Object.freeze({
    autoAnalyzeOnTrayOpen: true,
    autoAnalyzeDebounceMs: 220,
    visibleTagsPerTurn: 4,
    visibleTagsPerChat: 5,
    maxKeywordsPerTurn: 24,
    minTermLength: 3,
  });

  const STOPWORDS = new Set([
    'the','and','for','that','with','this','from','have','what','when','where','which','while','into','about','your','there','their','them','then','than','also','just','more','some','like','code','help','issue','thing','make','need','want','does','will','would','could','should','into','over','under','using',
    'und','oder','aber','nicht','eine','einer','einem','einen','dass','auch','noch','mehr','hier','dort','wenn','dann','wie','was',
    'على','من','الى','إلى','في','عن','هذا','هذه','ذلك','هناك','هنا','لكن'
  ]);

  const state = (MOD.state = MOD.state || {
    booted: false,
    cfg: null,
    turnCache: new Map(),       // chatId -> Map(turnKey -> record)
    chatCache: new Map(),       // chatId -> summary
    openTrays: new Map(),       // answerId -> trayEl
    openPopup: null,
    ensureTimers: new Map(),
    compactStorage: {
      chatCacheV2: null,
      tagPoolV2: null,
      turnCacheV2: null,
      lastStatus: null,
      bootScheduled: false,
    },
    clean: {
      timers: new Set(),
      listeners: new Set(),
      observers: new Set(),
      nodes: new Set(),
    },
  });

  const storage = {
    raw(key) {
      try {
        return W.localStorage?.getItem(key);
      } catch {
        return null;
      }
    },
    has(key) {
      try {
        return W.localStorage?.getItem(key) != null;
      } catch {
        return false;
      }
    },
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
      } catch {
        return false;
      }
    },
    del(key) {
      try {
        W.localStorage?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };

  function ensureCompactStorageState() {
    state.compactStorage = state.compactStorage || {};
    state.compactStorage.chatCacheV2 = state.compactStorage.chatCacheV2 || null;
    state.compactStorage.tagPoolV2 = state.compactStorage.tagPoolV2 || null;
    state.compactStorage.turnCacheV2 = state.compactStorage.turnCacheV2 || null;
    state.compactStorage.lastStatus = state.compactStorage.lastStatus || null;
    state.compactStorage.bootScheduled = !!state.compactStorage.bootScheduled;
    return state.compactStorage;
  }

  function makePlainObject(raw = null) {
    const out = Object.create(null);
    if (!raw || typeof raw !== 'object') return out;
    Object.entries(raw).forEach(([key, value]) => {
      if (key) out[key] = value;
    });
    return out;
  }

  function normalizeChatCacheV2(raw = null) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 2,
      updatedAt: Number(src.updatedAt || 0) || 0,
      chats: makePlainObject(src.chats),
    };
  }

  function normalizeTagPoolV2(raw = null) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const tags = Object.create(null);
    Object.entries(src.tags && typeof src.tags === 'object' ? src.tags : {}).forEach(([tagId, rawRow]) => {
      const id = String(tagId || '').trim();
      if (!id || !rawRow || typeof rawRow !== 'object') return;
      tags[id] = {
        id,
        updatedAt: Number(rawRow.updatedAt || 0) || 0,
        chats: makePlainObject(rawRow.chats),
      };
    });
    return {
      version: 2,
      updatedAt: Number(src.updatedAt || 0) || 0,
      chats: makePlainObject(src.chats),
      tags,
    };
  }

  function normalizeTurnCacheV2(raw = null) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const chats = Object.create(null);
    Object.entries(src.chats && typeof src.chats === 'object' ? src.chats : {}).forEach(([chatId, rows]) => {
      const id = String(chatId || '').trim();
      if (!id || !rows || typeof rows !== 'object') return;
      chats[id] = makePlainObject(rows);
    });
    return {
      version: 2,
      updatedAt: Number(src.updatedAt || 0) || 0,
      chats,
    };
  }

  function readChatCacheV2() {
    const compact = ensureCompactStorageState();
    if (compact.chatCacheV2) return compact.chatCacheV2;
    compact.chatCacheV2 = normalizeChatCacheV2(storage.getJSON(KEY_CHAT_CACHE_V2, null));
    return compact.chatCacheV2;
  }

  function readTagPoolV2() {
    const compact = ensureCompactStorageState();
    if (compact.tagPoolV2) return compact.tagPoolV2;
    compact.tagPoolV2 = normalizeTagPoolV2(storage.getJSON(KEY_TAG_POOL_V2, null));
    return compact.tagPoolV2;
  }

  function readTurnCacheV2() {
    const compact = ensureCompactStorageState();
    if (compact.turnCacheV2) return compact.turnCacheV2;
    compact.turnCacheV2 = normalizeTurnCacheV2(storage.getJSON(KEY_TURN_CACHE_V2, null));
    return compact.turnCacheV2;
  }

  function writeCompactJSON(key, value, cacheField, reason = '') {
    const compact = ensureCompactStorageState();
    const next = { ...(value && typeof value === 'object' ? value : {}), version: 2, updatedAt: Date.now() };
    const ok = storage.setJSON(key, next);
    if (ok) compact[cacheField] = next;
    else {
      compact.lastStatus = {
        ok: false,
        status: 'v2-write-failed',
        reason: String(reason || ''),
        key,
        ts: Date.now(),
      };
      err('tags-compact-write', `${key}:${reason || 'write-failed'}`);
    }
    return ok;
  }

  function writeChatCacheV2(env, reason = '') {
    return writeCompactJSON(KEY_CHAT_CACHE_V2, normalizeChatCacheV2(env), 'chatCacheV2', reason);
  }

  function writeTagPoolV2(env, reason = '') {
    return writeCompactJSON(KEY_TAG_POOL_V2, normalizeTagPoolV2(env), 'tagPoolV2', reason);
  }

  function writeTurnCacheV2(env, reason = '') {
    return writeCompactJSON(KEY_TURN_CACHE_V2, normalizeTurnCacheV2(env), 'turnCacheV2', reason);
  }

  function listLocalStorageKeys(prefix = '') {
    const keys = [];
    try {
      const ls = W.localStorage;
      const length = Number(ls?.length || 0);
      for (let i = 0; i < length; i += 1) {
        const key = String(ls?.key(i) || '');
        if (!prefix || key.startsWith(prefix)) keys.push(key);
      }
    } catch {}
    return keys;
  }

  function estimateLocalStorageBytes(key) {
    const raw = storage.raw(key);
    return (String(key || '').length + String(raw || '').length) * 2;
  }

  function rowTimestamp(row, fallback = 0) {
    if (!row || typeof row !== 'object') return Number(fallback || 0) || 0;
    return Number(row.updatedAt || row.analyzedAt || row.createdAt || fallback || 0) || 0;
  }

  function shouldPreferIncomingV1(existing, incoming) {
    if (existing == null) return true;
    const existingTs = rowTimestamp(existing);
    const incomingTs = rowTimestamp(incoming);
    return incomingTs > 0 && incomingTs > existingTs;
  }

  function maxRowsTimestamp(rows) {
    if (!rows || typeof rows !== 'object') return 0;
    return Object.values(rows).reduce((max, row) => Math.max(max, rowTimestamp(row)), 0);
  }

  function mergeV1ChatCacheIntoV2(env, chatId, summary) {
    const id = String(chatId || '').trim();
    if (!id) return false;
    if (!Object.prototype.hasOwnProperty.call(env.chats, id) || shouldPreferIncomingV1(env.chats[id], summary)) {
      env.chats[id] = summary || null;
      return true;
    }
    return false;
  }

  function mergeV1TagPoolIntoV2(env, chatId, pool) {
    const id = String(chatId || '').trim();
    if (!id || !pool || typeof pool !== 'object') return false;
    let changed = false;
    env.chats = env.chats || Object.create(null);
    const incomingUpdatedAt = maxRowsTimestamp(pool);
    const existingChatMeta = env.chats[id] && typeof env.chats[id] === 'object' ? env.chats[id] : null;
    if (existingChatMeta && (!incomingUpdatedAt || Number(existingChatMeta.updatedAt || 0) >= incomingUpdatedAt)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(env.chats, id)) {
      env.chats[id] = { updatedAt: incomingUpdatedAt || Date.now() };
      changed = true;
    }
    Object.entries(pool).forEach(([rawTagId, rawRow]) => {
      const tagId = String(rawRow?.id || rawTagId || '').trim();
      if (!tagId || !rawRow || typeof rawRow !== 'object') return;
      const bucket = env.tags[tagId] || { id: tagId, updatedAt: 0, chats: Object.create(null) };
      const existing = bucket.chats?.[id] || null;
      if (!bucket.chats) bucket.chats = Object.create(null);
      if (!existing || shouldPreferIncomingV1(existing, rawRow)) {
        bucket.chats[id] = rawRow;
        bucket.updatedAt = Math.max(Number(bucket.updatedAt || 0), rowTimestamp(rawRow));
        env.tags[tagId] = bucket;
        changed = true;
      }
    });
    if (changed) {
      env.chats[id] = { updatedAt: Math.max(Number(env.chats[id]?.updatedAt || 0), incomingUpdatedAt || Date.now()) };
    }
    return changed;
  }

  function mergeV1TurnCacheIntoV2(env, chatId, rows) {
    const id = String(chatId || '').trim();
    if (!id || !rows || typeof rows !== 'object') return false;
    const bucket = env.chats[id] || Object.create(null);
    const incomingUpdatedAt = maxRowsTimestamp(rows);
    const existingUpdatedAt = maxRowsTimestamp(bucket);
    if (Object.prototype.hasOwnProperty.call(env.chats || {}, id) && (!incomingUpdatedAt || existingUpdatedAt >= incomingUpdatedAt)) {
      return false;
    }
    let changed = false;
    Object.entries(rows).forEach(([turnKey, rawRow]) => {
      const key = String(turnKey || '').trim();
      if (!key || !rawRow || typeof rawRow !== 'object') return;
      if (!bucket[key] || shouldPreferIncomingV1(bucket[key], rawRow)) {
        bucket[key] = rawRow;
        changed = true;
      }
    });
    if (changed) env.chats[id] = bucket;
    return changed;
  }

  function scanTagsV1Storage() {
    const chatCacheKeys = listLocalStorageKeys(KEY_CHAT_CACHE_PREFIX);
    const tagPoolKeys = listLocalStorageKeys(KEY_TAG_POOL_PREFIX);
    const turnCacheKeys = listLocalStorageKeys(KEY_TURN_CACHE_PREFIX);
    return {
      chatCacheKeys,
      tagPoolKeys,
      turnCacheKeys,
      allKeys: [...chatCacheKeys, ...tagPoolKeys, ...turnCacheKeys],
    };
  }

  function verifyV1ChatCacheKeyMigrated(key, chatEnv = readChatCacheV2()) {
    if (!storage.has(KEY_CHAT_CACHE_V2)) return false;
    const chatId = String(key || '').slice(KEY_CHAT_CACHE_PREFIX.length).trim();
    return !!chatId && Object.prototype.hasOwnProperty.call(chatEnv.chats || {}, chatId);
  }

  function verifyV1TagPoolKeyMigrated(key, tagEnv = readTagPoolV2()) {
    if (!storage.has(KEY_TAG_POOL_V2)) return false;
    const chatId = String(key || '').slice(KEY_TAG_POOL_PREFIX.length).trim();
    if (!chatId) return false;
    const pool = storage.getJSON(key, null);
    if (!pool || typeof pool !== 'object' || !Object.keys(pool).length) {
      return Object.prototype.hasOwnProperty.call(tagEnv.chats || {}, chatId);
    }
    return Object.entries(pool).every(([rawTagId, rawRow]) => {
      const tagId = String(rawRow?.id || rawTagId || '').trim();
      return !!tagId && Object.prototype.hasOwnProperty.call(tagEnv.tags?.[tagId]?.chats || {}, chatId);
    });
  }

  function verifyV1TurnCacheKeyMigrated(key, turnEnv = readTurnCacheV2()) {
    if (!storage.has(KEY_TURN_CACHE_V2)) return false;
    const chatId = String(key || '').slice(KEY_TURN_CACHE_PREFIX.length).trim();
    if (!chatId) return false;
    const rows = storage.getJSON(key, null);
    if (!rows || typeof rows !== 'object' || !Object.keys(rows).length) return storage.has(KEY_TURN_CACHE_V2);
    return Object.keys(rows).every((turnKey) => Object.prototype.hasOwnProperty.call(turnEnv.chats?.[chatId] || {}, turnKey));
  }

  function getVerifiedMigratedV1Keys(opts = {}) {
    const includeTurnCache = opts.includeTurnCache === true;
    const scan = scanTagsV1Storage();
    const chatEnv = readChatCacheV2();
    const tagEnv = readTagPoolV2();
    const turnEnv = includeTurnCache ? readTurnCacheV2() : null;
    const chatCache = scan.chatCacheKeys.filter((key) => verifyV1ChatCacheKeyMigrated(key, chatEnv));
    const tagPool = scan.tagPoolKeys.filter((key) => verifyV1TagPoolKeyMigrated(key, tagEnv));
    const turnCache = includeTurnCache ? scan.turnCacheKeys.filter((key) => verifyV1TurnCacheKeyMigrated(key, turnEnv)) : [];
    const keys = [...chatCache, ...tagPool, ...turnCache];
    return {
      chatCache,
      tagPool,
      turnCache,
      keys,
      keyCount: keys.length,
      estimatedBytes: keys.reduce((sum, key) => sum + estimateLocalStorageBytes(key), 0),
      scanned: scan,
    };
  }

  function getCompactStorageDiagnostics() {
    const scan = scanTagsV1Storage();
    const hasChatV2 = storage.has(KEY_CHAT_CACHE_V2);
    const hasTagPoolV2 = storage.has(KEY_TAG_POOL_V2);
    const hasTurnV2 = storage.has(KEY_TURN_CACHE_V2);
    const v2Ready = hasChatV2 && hasTagPoolV2;
    const v1KeyCount = scan.allKeys.length;
    return {
      storageMode: v2Ready ? (v1KeyCount ? 'mixed' : 'v2') : 'v1',
      v2Ready,
      hasChatCacheV2: hasChatV2,
      hasTagPoolV2,
      hasTurnCacheV2: hasTurnV2,
      v1KeyCount,
      migratedChatCacheCount: Number(state.compactStorage?.lastStatus?.migratedChatCacheCount || 0) || 0,
      migratedTagPoolCount: Number(state.compactStorage?.lastStatus?.migratedTagPoolCount || 0) || 0,
      migratedTurnCacheCount: Number(state.compactStorage?.lastStatus?.migratedTurnCacheCount || 0) || 0,
      lastCompactStatus: state.compactStorage?.lastStatus?.status || '',
    };
  }

  function compactStorage(opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    const includeTurnCache = opts.includeTurnCache !== false;
    const scan = scanTagsV1Storage();
    const failures = [];

    let chatEnv = readChatCacheV2();
    let chatChanged = !storage.has(KEY_CHAT_CACHE_V2);
    scan.chatCacheKeys.forEach((key) => {
      const chatId = String(key || '').slice(KEY_CHAT_CACHE_PREFIX.length).trim();
      const summary = storage.getJSON(key, null);
      if (chatId && mergeV1ChatCacheIntoV2(chatEnv, chatId, summary)) chatChanged = true;
    });
    const chatWriteOk = !chatChanged || writeChatCacheV2(chatEnv, 'compact-chat-cache');
    if (!chatWriteOk) failures.push(KEY_CHAT_CACHE_V2);

    let tagEnv = readTagPoolV2();
    let tagChanged = !storage.has(KEY_TAG_POOL_V2);
    scan.tagPoolKeys.forEach((key) => {
      const chatId = String(key || '').slice(KEY_TAG_POOL_PREFIX.length).trim();
      const pool = storage.getJSON(key, null);
      if (chatId && pool && typeof pool === 'object' && mergeV1TagPoolIntoV2(tagEnv, chatId, pool)) tagChanged = true;
    });
    const tagWriteOk = !tagChanged || writeTagPoolV2(tagEnv, 'compact-tag-pool');
    if (!tagWriteOk) failures.push(KEY_TAG_POOL_V2);

    let turnWriteOk = true;
    if (includeTurnCache) {
      let turnEnv = readTurnCacheV2();
      let turnChanged = !storage.has(KEY_TURN_CACHE_V2);
      scan.turnCacheKeys.forEach((key) => {
        const chatId = String(key || '').slice(KEY_TURN_CACHE_PREFIX.length).trim();
        const rows = storage.getJSON(key, null);
        if (chatId && rows && typeof rows === 'object' && mergeV1TurnCacheIntoV2(turnEnv, chatId, rows)) turnChanged = true;
      });
      turnWriteOk = !turnChanged || writeTurnCacheV2(turnEnv, 'compact-turn-cache');
      if (!turnWriteOk) failures.push(KEY_TURN_CACHE_V2);
    }

    const verified = getVerifiedMigratedV1Keys({ includeTurnCache });
    const requiredFailures = failures.filter((key) => key !== KEY_TURN_CACHE_V2);
    const status = {
      ok: requiredFailures.length === 0,
      status: requiredFailures.length ? 'partial-write-failed' : (failures.length ? 'ok-turn-cache-write-failed' : 'ok'),
      source: String(opts.source || opts.reason || 'compact-storage'),
      v2Ready: storage.has(KEY_CHAT_CACHE_V2) && storage.has(KEY_TAG_POOL_V2),
      chatWriteOk,
      tagWriteOk,
      turnWriteOk,
      migratedChatCacheCount: verified.chatCache.length,
      migratedTagPoolCount: verified.tagPool.length,
      migratedTurnCacheCount: verified.turnCache.length,
      v1KeyCount: scan.allKeys.length,
      eligibleCleanupKeyCount: verified.keyCount,
      eligibleCleanupEstimatedBytes: verified.estimatedBytes,
      failures,
      ts: Date.now(),
    };
    ensureCompactStorageState().lastStatus = status;
    step('tags-compact-storage', `${status.status}:${status.eligibleCleanupKeyCount}`);
    return status;
  }

  function cleanupMigratedV1Storage(opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    const dryRun = opts.dryRun !== false;
    const includeTurnCache = opts.includeTurnCache === true;
    const compact = compactStorage({ source: 'cleanup-preflight', includeTurnCache });
    const verified = getVerifiedMigratedV1Keys({ includeTurnCache });
    const result = {
      ok: compact.ok,
      dryRun,
      status: compact.ok ? (dryRun ? 'dry-run' : 'cleanup-ready') : 'compact-verification-failed',
      compact,
      eligibleKeys: {
        chatCache: verified.chatCache,
        tagPool: verified.tagPool,
        turnCache: verified.turnCache,
      },
      eligibleKeyCount: verified.keyCount,
      estimatedBytes: verified.estimatedBytes,
      deletedKeys: [],
      failedKeys: [],
      ts: Date.now(),
    };
    if (dryRun || !compact.ok) return result;
    verified.keys.forEach((key) => {
      if (storage.del(key)) result.deletedKeys.push(key);
      else result.failedKeys.push(key);
    });
    result.ok = result.failedKeys.length === 0;
    result.status = result.ok ? 'cleanup-complete' : 'cleanup-partial';
    ensureCompactStorageState().lastStatus = {
      ...compact,
      status: result.status,
      deletedKeyCount: result.deletedKeys.length,
      failedDeleteKeyCount: result.failedKeys.length,
      ts: Date.now(),
    };
    return result;
  }

  function getCfg() {
    if (state.cfg) return state.cfg;
    const next = storage.getJSON(KEY_CFG, null);
    state.cfg = normalizeCfg(next);
    return state.cfg;
  }

  function setCfg(partial = {}) {
    const current = getCfg();
    const next = normalizeCfg({ ...current, ...(partial && typeof partial === 'object' ? partial : {}) });
    state.cfg = next;
    storage.setJSON(KEY_CFG, next);
    return next;
  }

  function normalizeCfg(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    return {
      autoAnalyzeOnTrayOpen: src.autoAnalyzeOnTrayOpen !== false,
      autoAnalyzeDebounceMs: clampInt(src.autoAnalyzeDebounceMs, 40, 5000, CFG_DEFAULTS.autoAnalyzeDebounceMs),
      visibleTagsPerTurn: clampInt(src.visibleTagsPerTurn, 1, 10, CFG_DEFAULTS.visibleTagsPerTurn),
      visibleTagsPerChat: clampInt(src.visibleTagsPerChat, 1, 12, CFG_DEFAULTS.visibleTagsPerChat),
      maxKeywordsPerTurn: clampInt(src.maxKeywordsPerTurn, 4, 120, CFG_DEFAULTS.maxKeywordsPerTurn),
      minTermLength: clampInt(src.minTermLength, 2, 12, CFG_DEFAULTS.minTermLength),
    };
  }

  function clampInt(v, min, max, fallback) {
    const n = Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function safeDispatch(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function toChatId(raw = '') {
    const value = String(raw || '').trim();
    if (value) return value;
    try {
      const fromArchive = H2O.archiveBoot?.getCurrentChatId?.();
      if (fromArchive) return String(fromArchive).trim();
    } catch {}
    try {
      const fromUtil = H2O.util?.getChatId?.();
      if (fromUtil) return String(fromUtil).trim();
    } catch {}
    try {
      const match = String(W.location.pathname || '').match(/\/c\/([^/?#]+)/i);
      return match ? String(match[1] || '').trim() : '';
    } catch {
      return '';
    }
  }

  function normalizeId(raw = '') {
    return String(raw || '').replace(/^conversation-turn-/, '').trim();
  }

  function normalizeLabel(raw = '') {
    return String(raw || '').trim().replace(/\s+/g, ' ').replace(/^[-–—•\s]+|[-–—•\s]+$/g, '');
  }

  function slugify(raw = '') {
    return normalizeLabel(raw)
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function normalizeTag(raw, extra = {}) {
    const label = normalizeLabel(typeof raw === 'string' ? raw : (raw?.label || raw?.name || ''));
    if (!label) return null;
    return {
      id: slugify(extra.id || raw?.id || label) || label.toLowerCase(),
      label,
      score: Number.isFinite(Number(extra.score ?? raw?.score)) ? Number(extra.score ?? raw?.score) : 0,
      source: String(extra.source || raw?.source || 'auto'),
      visible: extra.visible !== false && raw?.visible !== false,
    };
  }

  function normalizeKeyword(raw, extra = {}) {
    const term = normalizeLabel(typeof raw === 'string' ? raw : (raw?.term || raw?.label || ''));
    if (!term) return null;
    return {
      term: term.toLowerCase(),
      weight: Number.isFinite(Number(extra.weight ?? raw?.weight)) ? Number(extra.weight ?? raw?.weight) : 0,
      source: String(extra.source || raw?.source || 'auto'),
    };
  }

  function uniqTags(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const tag = normalizeTag(row);
      if (!tag) continue;
      const prev = map.get(tag.id);
      if (!prev || tag.score > prev.score) map.set(tag.id, tag);
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  function uniqKeywords(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const kw = normalizeKeyword(row);
      if (!kw) continue;
      const prev = map.get(kw.term);
      if (!prev) map.set(kw.term, kw);
      else prev.weight = Math.max(prev.weight, kw.weight);
    }
    return Array.from(map.values()).sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
  }

  function getTurnRuntime() {
    return W?.H2O?.turnRuntime || null;
  }

  function getTitleApi() {
    return W?.H2O?.AT?.tnswrttl?.api?.public || null;
  }

  function getArchiveBoot() {
    return H2O.archiveBoot || null;
  }

  function safeListWorkbenchRows() {
    try {
      const fn = H2O.archiveBoot?.listWorkbenchRows;
      return typeof fn === 'function' ? fn() : [];
    } catch (e) {
      err('list-workbench-rows', e);
      return [];
    }
  }

  function normalizeHexColor(raw) {
    const value = String(raw || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '';
  }

  function normalizeTagKey(raw) {
    return String(raw?.id || raw?.label || raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getPriorityLabelTagBlocklist() {
    const blocked = new Set();
    try {
      const labels = H2O.archiveBoot?.getLabelsCatalog?.() || [];
      (Array.isArray(labels) ? labels : []).forEach((row) => {
        if (String(row?.type || '').trim() !== 'priority') return;
        const key = normalizeTagKey(row?.name || row?.label || row?.id || '');
        if (key) blocked.add(key);
      });
    } catch {}
    blocked.add('important');
    return blocked;
  }

  function parseChatIdFromHref(href) {
    const match = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : '';
  }

  function findChatHrefInSidebarByChatId(chatId) {
    const id = String(chatId || '').trim();
    if (!id || !D?.querySelectorAll) return '';
    for (const anchor of D.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      if (parseChatIdFromHref(href) === id) return href;
    }
    return '';
  }

  function nativeHrefForRow(row) {
    const chatId = String(row?.chatId || '').trim();
    if (!chatId || /^imported[-_:]/i.test(chatId)) return '';
    const liveHref = findChatHrefInSidebarByChatId(chatId);
    if (liveHref) return liveHref;
    if (!/^[a-z0-9-]{8,}$/i.test(chatId)) return '';
    return `/c/${encodeURIComponent(chatId)}`;
  }

  function getUiShellService() {
    return core.getService?.('ui-shell') || null;
  }

  function getPageHostService() {
    return core.getService?.('page-host') || null;
  }

  function classText(el) {
    return String(el?.className || '');
  }

  function hasClassTokens(el, tokens) {
    const classes = classText(el);
    return (Array.isArray(tokens) ? tokens : []).every((token) => classes.includes(token));
  }

  function isScrollPageHost(el) {
    if (!(el instanceof HTMLElement)) return false;
    const classes = classText(el);
    return classes.includes('group/scroll-root') ||
      (classes.includes('overflow-y-auto') && classes.includes('flex-col') && classes.includes('min-h-0'));
  }

  function resolveRightPanePageHost() {
    const main = D.querySelector('main');
    if (main instanceof HTMLElement) {
      const candidates = [main, ...main.querySelectorAll('div')];
      const scrollRoot = candidates.find((el) => isScrollPageHost(el));
      if (scrollRoot instanceof HTMLElement) return scrollRoot;
      return main;
    }

    const thread = D.getElementById('thread');
    const composer = thread?.parentElement || null;
    const shell = composer?.parentElement || null;
    if (shell instanceof HTMLElement && hasClassTokens(shell, ['relative', 'grow', 'grid'])) return shell;
    if (composer instanceof HTMLElement && (
      classText(composer).includes('composer-parent') ||
      composer.getAttribute('role') === 'presentation'
    )) return composer;
    if (thread instanceof HTMLElement) return thread;
    return null;
  }

  function ensurePageHostState() {
    if (!Number.isFinite(Number(state.pageSeq))) state.pageSeq = 0;
    if (!Array.isArray(state.pageHiddenRecords)) state.pageHiddenRecords = [];
    state.pageSession = state.pageSession || null;
    state.pageEl = state.pageEl || null;
    state.pageHost = state.pageHost || null;
    state.viewerEl = state.viewerEl || null;
  }

  function makeShellEnv() {
    ensurePageHostState();
    state.clean = state.clean || { timers: new Set(), listeners: new Set(), observers: new Set(), nodes: new Set() };
    state.clean.timers = state.clean.timers || new Set();
    state.clean.listeners = state.clean.listeners || new Set();
    state.clean.observers = state.clean.observers || new Set();
    state.clean.nodes = state.clean.nodes || new Set();
    return {
      W,
      D,
      H2O,
      STATE: state,
      CLEAN: state.clean,
      SkID,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      ATTR_CGXUI_STATE,
      ATTR_CGXUI_MODE,
      ATTR_CGXUI_PAGE_HIDDEN,
      UI_FSECTION_VIEWER,
      UI_FSECTION_PAGE_HOST,
      UI_FSECTION_PAGE,
      FRAG_SVG_CATEGORY: SVG_TAG_ICON,
      DOM_resolveRightPanePageHost: resolveRightPanePageHost,
      STORE_normalizeCategoryOpenMode: (mode) => String(mode || 'panel'),
      STORE_normalizeHexColor: normalizeHexColor,
      SAFE_remove: (node) => {
        try { node?.remove?.(); } catch {}
      },
    };
  }

  function closeViewer() {
    const svc = getPageHostService();
    if (svc?.UI_closeViewer) {
      try {
        svc.UI_closeViewer(makeShellEnv());
        return true;
      } catch (e) {
        err('tags-page-host-close', e);
      }
    }
    try { state.viewerEl?.remove?.(); } catch {}
    state.viewerEl = null;
    return true;
  }

  function makeViewerShell(titleText, subText, opts = {}) {
    const svc = getUiShellService();
    if (svc?.UI_makeViewerShell) {
      try {
        const shell = svc.UI_makeViewerShell(makeShellEnv(), titleText, subText, opts);
        if (shell?.box && shell?.list) return shell;
      } catch (e) {
        err('tags-ui-shell-panel', e);
      }
    }
    return makeLocalViewerShell(titleText, subText, opts);
  }

  function makeInShellPageShell(titleText, subText, tabText = 'Chats', opts = {}) {
    const svc = getUiShellService();
    if (svc?.UI_makeInShellPageShell) {
      try {
        const shell = svc.UI_makeInShellPageShell(makeShellEnv(), titleText, subText, tabText, opts);
        if (shell?.page && shell?.list) return shell;
      } catch (e) {
        err('tags-ui-shell-page', e);
      }
    }
    return makeLocalPageShell(titleText, subText, tabText, opts);
  }

  function mountInShellPage(pageEl) {
    const svc = getPageHostService();
    if (svc?.UI_mountInShellPage) {
      try {
        return !!svc.UI_mountInShellPage(makeShellEnv(), pageEl);
      } catch (e) {
        err('tags-page-host-mount', e);
      }
    }
    return false;
  }

  function makeLocalViewerShell(titleText, subText, opts = {}) {
    const box = D.createElement('div');
    box.setAttribute(ATTR_CGXUI, UI_FSECTION_VIEWER);
    box.setAttribute(ATTR_CGXUI_OWNER, SkID);
    box.setAttribute(ATTR_CGXUI_MODE, opts.mode || 'panel');

    const page = D.createElement('div');
    page.setAttribute(ATTR_CGXUI_STATE, 'page');

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'head');

    const icon = D.createElement('span');
    icon.setAttribute(ATTR_CGXUI_STATE, 'panel-icon');
    icon.style.color = normalizeHexColor(opts.iconColor || '') || 'currentColor';
    icon.innerHTML = opts.iconSvg || SVG_TAG_ICON;
    head.appendChild(icon);

    const titleWrap = D.createElement('div');
    titleWrap.style.minWidth = '0';
    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'title');
    title.textContent = titleText;
    titleWrap.appendChild(title);
    if (subText) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'sub');
      sub.textContent = subText;
      titleWrap.appendChild(sub);
    }
    head.appendChild(titleWrap);

    const close = D.createElement('button');
    close.type = 'button';
    close.setAttribute(ATTR_CGXUI_STATE, 'close');
    close.setAttribute('aria-label', 'Close');
    close.textContent = 'x';
    close.onclick = () => closeViewer();
    head.appendChild(close);

    const list = D.createElement('ol');
    list.setAttribute(ATTR_CGXUI_STATE, 'list');

    page.appendChild(head);
    page.appendChild(list);
    box.appendChild(page);
    return { box, list };
  }

  function makeLocalPageShell(titleText, subText, tabText = 'Chats', opts = {}) {
    const page = D.createElement('div');
    page.setAttribute(ATTR_CGXUI, UI_FSECTION_PAGE);
    page.setAttribute(ATTR_CGXUI_OWNER, SkID);
    page.setAttribute('data-cgxui-page-kind', String(opts.kind || 'tags'));
    page.setAttribute('data-cgxui-page-id', String(opts.id || ''));
    page.setAttribute('data-cgxui-page-title', String(titleText || 'Tags'));
    page.className = '[--thread-content-max-width:40rem] @w-lg/main:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 grid h-full [width:min(90cqw,var(--thread-content-max-width))]';

    const top = D.createElement('div');
    top.setAttribute(ATTR_CGXUI_STATE, 'top');

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'head');

    const titleWrap = D.createElement('div');
    titleWrap.style.minWidth = '0';
    const titleRow = D.createElement('div');
    titleRow.setAttribute(ATTR_CGXUI_STATE, 'title-row');

    const icon = D.createElement('div');
    icon.setAttribute(ATTR_CGXUI_STATE, 'title-icon');
    icon.style.color = normalizeHexColor(opts.iconColor || '') || 'currentColor';
    icon.innerHTML = opts.iconSvg || SVG_TAG_ICON;
    titleRow.appendChild(icon);

    const h1 = D.createElement('h1');
    h1.textContent = titleText;
    titleRow.appendChild(h1);
    titleWrap.appendChild(titleRow);
    if (subText) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'sub');
      sub.textContent = subText;
      titleWrap.appendChild(sub);
    }
    head.appendChild(titleWrap);
    top.appendChild(head);

    const tabs = D.createElement('div');
    tabs.setAttribute(ATTR_CGXUI_STATE, 'tabs');
    const tab = D.createElement('button');
    tab.type = 'button';
    tab.setAttribute(ATTR_CGXUI_STATE, 'tab');
    tab.setAttribute('aria-selected', 'true');
    tab.textContent = tabText;
    tabs.appendChild(tab);
    top.appendChild(tabs);

    const list = D.createElement('ol');
    list.setAttribute(ATTR_CGXUI_STATE, 'list');

    page.appendChild(top);
    page.appendChild(list);
    return { page, list };
  }

  function cssEscapeValue(raw = '') {
    const value = String(raw || '').trim();
    try { return CSS.escape(value); } catch { return value.replace(/[^a-z0-9_-]/gi, '\\$&'); }
  }

  function findTurnRootForNode(node) {
    if (!(node instanceof HTMLElement)) return null;
    return node.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || null;
  }

  function findAssistantNodeForTurn(turn) {
    const direct = turn?.answerEl || turn?.assistantEl || null;
    if (direct instanceof HTMLElement) return direct;
    const answerId = normalizeId(turn?.answerId || turn?.turnId || '');
    if (answerId) {
      const esc = cssEscapeValue(answerId);
      let node = D.querySelector(`[data-message-author-role="assistant"][data-message-id="${esc}"]`)
        || D.querySelector(`[data-message-author-role="assistant"][data-turn-id="${esc}"]`);
      if (node instanceof HTMLElement) return node;
      const bar = getTitleApi()?.getBar?.(answerId) || null;
      const root = findTurnRootForNode(bar);
      node = root?.querySelector?.('[data-message-author-role="assistant"]') || null;
      if (node instanceof HTMLElement) return node;
    }
    const root = findTurnRootForNode(turn?.node) || findTurnRootForNode(turn?.answerEl) || null;
    const fallback = root?.querySelector?.('[data-message-author-role="assistant"]') || null;
    return fallback instanceof HTMLElement ? fallback : null;
  }

  function findQuestionNodeForTurn(turn) {
    const direct = turn?.questionEl || turn?.userEl || turn?.promptEl || null;
    if (direct instanceof HTMLElement) return direct;
    const root = findTurnRootForNode(turn?.node) || findTurnRootForNode(findAssistantNodeForTurn(turn)) || null;
    const fallback = root?.querySelector?.('[data-message-author-role="user"]') || null;
    return fallback instanceof HTMLElement ? fallback : null;
  }

  function refreshChatSummaryAndProject(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return null;
    const res = aggregateChat(chatId, { reason: opts.reason || 'refresh-chat-summary' });
    if (opts.project !== false) {
      Promise.resolve().then(() => projectChatMetadata(chatId, { reason: opts.reason || 'refresh-chat-summary' })).catch(() => {});
    }
    return res?.summary || null;
  }

  function readTurnCache(chatId) {
    const id = toChatId(chatId);
    if (!id) return new Map();
    const cached = state.turnCache.get(id);
    if (cached instanceof Map) return cached;
    const turnEnv = readTurnCacheV2();
    const rows = turnEnv.chats?.[id] || storage.getJSON(`${KEY_TURN_CACHE_PREFIX}${id}`, null);
    const map = new Map();
    if (rows && typeof rows === 'object') {
      Object.entries(rows).forEach(([k, v]) => {
        if (k) map.set(k, v);
      });
    }
    state.turnCache.set(id, map);
    return map;
  }

  function writeTurnCache(chatId) {
    const id = toChatId(chatId);
    if (!id) return false;
    const map = readTurnCache(id);
    const obj = Object.create(null);
    map.forEach((v, k) => { obj[k] = v; });
    const env = readTurnCacheV2();
    env.chats[id] = obj;
    if (writeTurnCacheV2(env, 'write-turn-cache')) return true;
    return storage.setJSON(`${KEY_TURN_CACHE_PREFIX}${id}`, obj);
  }

  function readManualStore(chatId) {
    const id = toChatId(chatId);
    return storage.getJSON(`${KEY_MANUAL_PREFIX}${id}`, Object.create(null)) || Object.create(null);
  }

  function writeManualStore(chatId, data) {
    const id = toChatId(chatId);
    if (!id) return false;
    return storage.setJSON(`${KEY_MANUAL_PREFIX}${id}`, data && typeof data === 'object' ? data : Object.create(null));
  }

  function readTagPool(chatId) {
    const id = toChatId(chatId);
    if (!id) return Object.create(null);
    const env = readTagPoolV2();
    const fromV2 = Object.create(null);
    Object.entries(env.tags || {}).forEach(([tagId, bucket]) => {
      const row = bucket?.chats?.[id];
      if (row && typeof row === 'object') fromV2[tagId] = row;
    });
    if (Object.keys(fromV2).length || Object.prototype.hasOwnProperty.call(env.chats || {}, id)) return fromV2;
    const raw = storage.getJSON(`${KEY_TAG_POOL_PREFIX}${id}`, null);
    return raw && typeof raw === 'object' ? raw : Object.create(null);
  }

  function writeTagPool(chatId, pool) {
    const id = toChatId(chatId);
    if (!id) return false;
    const nextPool = pool && typeof pool === 'object' ? pool : Object.create(null);
    const env = readTagPoolV2();
    env.chats = env.chats || Object.create(null);
    Object.keys(env.tags || {}).forEach((tagId) => {
      const bucket = env.tags[tagId];
      if (!bucket?.chats) return;
      delete bucket.chats[id];
      if (!Object.keys(bucket.chats).length) delete env.tags[tagId];
    });
    Object.entries(nextPool).forEach(([rawTagId, rawRow]) => {
      const tagId = String(rawRow?.id || rawTagId || '').trim();
      if (!tagId || !rawRow || typeof rawRow !== 'object') return;
      const bucket = env.tags[tagId] || { id: tagId, updatedAt: 0, chats: Object.create(null) };
      bucket.chats = bucket.chats || Object.create(null);
      bucket.chats[id] = rawRow;
      bucket.updatedAt = Math.max(Number(bucket.updatedAt || 0), rowTimestamp(rawRow));
      env.tags[tagId] = bucket;
    });
    env.chats[id] = { updatedAt: Date.now() };
    if (writeTagPoolV2(env, 'write-tag-pool')) return true;
    return storage.setJSON(`${KEY_TAG_POOL_PREFIX}${id}`, nextPool);
  }

  function normalizeTagMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === TAG_MODE_SUGGESTION) return TAG_MODE_SUGGESTION;
    if (value === TAG_MODE_AUTO) return TAG_MODE_AUTO;
    return TAG_MODE_MANUAL;
  }

  function readChatMode(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return TAG_MODE_MANUAL;
    const raw = storage.getJSON(`${KEY_CHAT_MODE_PREFIX}${chatId}`, null);
    return normalizeTagMode(raw?.mode || raw);
  }

  function writeChatMode(chatIdRaw, modeRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return TAG_MODE_MANUAL;
    const mode = normalizeTagMode(modeRaw);
    storage.setJSON(`${KEY_CHAT_MODE_PREFIX}${chatId}`, { mode, updatedAt: Date.now() });
    return mode;
  }

  function getChatMode(chatIdRaw) {
    return readChatMode(chatIdRaw);
  }

  function normalizeSuggestionItem(raw) {
    const tag = normalizeTag(raw, { source: raw?.source || 'engine', visible: true });
    if (!tag) return null;
    return {
      id: tag.id,
      label: tag.label,
      score: Number.isFinite(Number(raw?.score ?? tag.score)) ? Number(raw?.score ?? tag.score) : 0,
      confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw?.confidence) : null,
      status: String(raw?.status || 'pending'),
      generatedAt: Number.isFinite(Number(raw?.generatedAt)) ? Number(raw?.generatedAt) : Date.now(),
      source: String(raw?.source || 'engine'),
    };
  }

  function readSuggestionsStore(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return Object.create(null);
    const raw = storage.getJSON(`${KEY_SUGGESTIONS_PREFIX}${chatId}`, null);
    return raw && typeof raw === 'object' ? raw : Object.create(null);
  }

  function writeSuggestionsStore(chatIdRaw, store) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return false;
    return storage.setJSON(`${KEY_SUGGESTIONS_PREFIX}${chatId}`, store && typeof store === 'object' ? store : Object.create(null));
  }

  function getTurnSuggestions(chatIdRaw, turnKeyRaw) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnKeyRaw);
    if (!chatId || !turnKey) return [];
    const store = readSuggestionsStore(chatId);
    const row = store[turnKey] && typeof store[turnKey] === 'object' ? store[turnKey] : null;
    const items = Array.isArray(row?.items) ? row.items.map(normalizeSuggestionItem).filter(Boolean) : [];
    return items.filter((item) => item.status !== 'dismissed');
  }

  function setTurnSuggestions(chatIdRaw, turnKeyRaw, suggestions) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnKeyRaw);
    if (!chatId || !turnKey) return [];
    const store = readSuggestionsStore(chatId);
    // Preserve dismissed/accepted statuses so they survive tray-close/reopen cycles.
    const existing = store[turnKey] && typeof store[turnKey] === 'object' ? store[turnKey] : null;
    const existingStatus = new Map();
    if (existing) {
      (Array.isArray(existing.items) ? existing.items : []).forEach((item) => {
        const norm = normalizeSuggestionItem(item);
        if (norm && (norm.status === 'dismissed' || norm.status === 'accepted')) existingStatus.set(norm.id, norm.status);
      });
    }
    const items = (Array.isArray(suggestions) ? suggestions : []).map((raw) => {
      const norm = normalizeSuggestionItem(raw);
      if (!norm) return null;
      const prevStatus = existingStatus.get(norm.id);
      return prevStatus ? { ...norm, status: prevStatus } : norm;
    }).filter(Boolean);
    store[turnKey] = { items, updatedAt: Date.now() };
    writeSuggestionsStore(chatId, store);
    return items;
  }

  function clearTurnSuggestions(chatIdRaw, turnKeyRaw) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnKeyRaw);
    if (!chatId || !turnKey) return false;
    const store = readSuggestionsStore(chatId);
    delete store[turnKey];
    return writeSuggestionsStore(chatId, store);
  }

  function markSuggestionStatus(chatIdRaw, turnKeyRaw, suggestionIdOrLabel, status = 'dismissed') {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnKeyRaw);
    const id = slugify(suggestionIdOrLabel) || String(suggestionIdOrLabel || '').trim().toLowerCase();
    if (!chatId || !turnKey || !id) return [];
    const store = readSuggestionsStore(chatId);
    const row = store[turnKey] && typeof store[turnKey] === 'object' ? store[turnKey] : { items: [] };
    row.items = (Array.isArray(row.items) ? row.items : []).map((item) => {
      const norm = normalizeSuggestionItem(item);
      if (!norm) return null;
      return norm.id === id ? { ...norm, status, updatedAt: Date.now() } : norm;
    }).filter(Boolean);
    row.updatedAt = Date.now();
    store[turnKey] = row;
    writeSuggestionsStore(chatId, store);
    return row.items;
  }

  function getAttachedVisibleTags(chatIdRaw, turnIdOrAnswerId, record = null) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnIdOrAnswerId);
    if (!chatId || !turnKey) return [];
    const manual = readManualStore(chatId);
    const row = manual[turnKey] && typeof manual[turnKey] === 'object' ? manual[turnKey] : {};
    const removed = new Set(Array.isArray(row.removed) ? row.removed.map((x) => String(x || '')) : []);
    const hidden = new Set(Array.isArray(row.hidden) ? row.hidden.map((x) => String(x || '')) : []);
    return uniqTags((Array.isArray(row.added) ? row.added : []).map((item) => normalizeTag(item)).filter(Boolean))
      .filter((tag) => !removed.has(tag.id) && !hidden.has(tag.id) && tag.visible !== false);
  }

  function buildSuggestionCandidates(chatIdRaw, turnIdOrAnswerId, record = null) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnIdOrAnswerId);
    const rec = record || getTurnState(chatId, turnKey);
    const attachedIds = new Set(getAttachedVisibleTags(chatId, turnKey, rec).map((tag) => tag.id));
    const manual = readManualStore(chatId);
    const row = manual[turnKey] && typeof manual[turnKey] === 'object' ? manual[turnKey] : {};
    const removed = new Set(Array.isArray(row.removed) ? row.removed.map((x) => String(x || '')) : []);
    return (Array.isArray(rec?.auto?.tags) ? rec.auto.tags : []).map(normalizeSuggestionItem).filter(Boolean)
      .filter((item) => !attachedIds.has(item.id) && !removed.has(item.id));
  }

  function maybeAutoAttachSuggestions(chatIdRaw, turnIdOrAnswerId, suggestions) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnIdOrAnswerId);
    const mode = getChatMode(chatId);
    if (mode !== TAG_MODE_AUTO) return [];
    const items = (Array.isArray(suggestions) ? suggestions : []).map(normalizeSuggestionItem).filter(Boolean);
    const manual = readManualStore(chatId);
    const row = manual[turnKey] && typeof manual[turnKey] === 'object' ? manual[turnKey] : {};
    const removed = new Set(Array.isArray(row.removed) ? row.removed.map((x) => String(x || '')) : []);
    const attached = new Set(getAttachedVisibleTags(chatId, turnKey).map((tag) => tag.id));
    const accepted = [];
    items.sort((a,b) => (b.score - a.score) || a.label.localeCompare(b.label));
    for (const item of items) {
      if (accepted.length >= 3) break;
      if (removed.has(item.id) || attached.has(item.id)) continue;
      if (Number(item.score || 0) < 6.0) continue;
      addManualTag(chatId, turnKey, { id: item.id, label: item.label, score: item.score, source: 'auto' });
      accepted.push(item.id);
      attached.add(item.id);
    }
    if (accepted.length) {
      const store = readSuggestionsStore(chatId);
      const row2 = store[turnKey] && typeof store[turnKey] === 'object' ? store[turnKey] : { items: [] };
      row2.items = (Array.isArray(row2.items) ? row2.items : []).map((item) => {
        const norm = normalizeSuggestionItem(item);
        if (!norm) return null;
        return accepted.includes(norm.id) ? { ...norm, status: 'accepted' } : norm;
      }).filter(Boolean);
      row2.updatedAt = Date.now();
      store[turnKey] = row2;
      writeSuggestionsStore(chatId, store);
    }
    return accepted;
  }

  function initialTagColor(tagIdOrLabel = '') {
    const id = String(tagIdOrLabel || '');
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    const idx = Math.abs(hash) % TAG_COLOR_PALETTE.length;
    return TAG_COLOR_PALETTE[idx] || TAG_COLOR_PALETTE[0];
  }

  function ensureTagInPool(chatIdRaw, tagLike) {
    const chatId = toChatId(chatIdRaw);
    const tag = normalizeTag(tagLike);
    if (!chatId || !tag) return null;
    const pool = readTagPool(chatId);
    const current = pool[tag.id] && typeof pool[tag.id] === 'object' ? pool[tag.id] : null;
    const next = {
      id: tag.id,
      label: tag.label,
      color: String(current?.color || initialTagColor(tag.id)).trim(),
      createdAt: Number(current?.createdAt || Date.now()),
      updatedAt: Date.now(),
      source: String(tag.source || current?.source || 'auto'),
      usageCount: Number(current?.usageCount || 0) || 0,
    };
    pool[tag.id] = next;
    writeTagPool(chatId, pool);
    return next;
  }

  function listTagPool(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    const pool = readTagPool(chatId);
    return Object.values(pool || {}).sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
  }

  function setTagColor(chatIdRaw, tagIdOrLabel, colorRaw) {
    const chatId = toChatId(chatIdRaw);
    const tagId = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
    const color = String(colorRaw || '').trim().toUpperCase();
    if (!chatId || !tagId || !/^#[0-9A-F]{6}$/.test(color)) return null;
    const pool = readTagPool(chatId);
    const row = pool[tagId];
    if (!row) return null;
    row.color = color;
    row.updatedAt = Date.now();
    pool[tagId] = row;
    writeTagPool(chatId, pool);
    refreshChatSummaryAndProject(chatId, { reason: 'set-tag-color' });
    safeDispatch(EV_TAGS_CHANGED, { chatId, tagId, color, source: 'tag-editor', action: 'set-color', ts: Date.now() });
    return row;
  }

  function renameTagInPool(chatIdRaw, tagIdOrLabel, nextLabelRaw) {
    const chatId = toChatId(chatIdRaw);
    const tagId = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
    const nextLabel = normalizeLabel(nextLabelRaw);
    if (!chatId || !tagId || !nextLabel) return null;
    const nextId = slugify(nextLabel) || tagId;
    const pool = readTagPool(chatId);
    const row = pool[tagId];
    if (!row) return null;
    delete pool[tagId];
    pool[nextId] = { ...row, id: nextId, label: nextLabel, updatedAt: Date.now() };
    writeTagPool(chatId, pool);
    const manual = readManualStore(chatId);
    Object.keys(manual).forEach((turnKey) => {
      const m = manual[turnKey] || {};
      if (Array.isArray(m.added)) {
        m.added = m.added.map((item) => String(item?.id || '') === tagId ? { ...item, id: nextId, label: nextLabel } : item);
      }
      ['removed','pinned','hidden'].forEach((k) => {
        if (Array.isArray(m[k])) m[k] = m[k].map((x) => x === tagId ? nextId : x);
      });
      manual[turnKey] = m;
    });
    writeManualStore(chatId, manual);
    refreshChatSummaryAndProject(chatId, { reason: 'rename-tag' });
    safeDispatch(EV_TAGS_CHANGED, { chatId, tagId, nextId, label: nextLabel, source: 'tag-editor', action: 'rename', ts: Date.now() });
    return pool[nextId];
  }

  function getTagColor(chatIdRaw, tagIdOrLabel) {
    const chatId = toChatId(chatIdRaw);
    const tagId = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
    const pool = readTagPool(chatId);
    return String(pool?.[tagId]?.color || initialTagColor(tagId)).trim();
  }

  function readChatSummary(chatId) {
    const id = toChatId(chatId);
    if (!id) return null;
    if (state.chatCache.has(id)) return state.chatCache.get(id) || null;
    const chatEnv = readChatCacheV2();
    const summary = Object.prototype.hasOwnProperty.call(chatEnv.chats || {}, id)
      ? chatEnv.chats[id]
      : storage.getJSON(`${KEY_CHAT_CACHE_PREFIX}${id}`, null);
    state.chatCache.set(id, summary || null);
    return summary || null;
  }

  function writeChatSummary(chatId, summary) {
    const id = toChatId(chatId);
    if (!id) return false;
    state.chatCache.set(id, summary || null);
    const env = readChatCacheV2();
    env.chats[id] = summary || null;
    if (writeChatCacheV2(env, 'write-chat-summary')) return true;
    return storage.setJSON(`${KEY_CHAT_CACHE_PREFIX}${id}`, summary || null);
  }

  function hasManualTagEntries(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return false;
    const manual = readManualStore(chatId);
    return Object.values(manual || {}).some((row) => Array.isArray(row?.added) && row.added.some(Boolean));
  }

  function buildStoredManualTagCatalog(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return [];
    const manual = readManualStore(chatId);
    const pool = readTagPool(chatId);
    const usage = new Map();
    const turnUsage = new Map();

    Object.entries(manual || {}).forEach(([turnKey, rawRow]) => {
      const row = rawRow && typeof rawRow === 'object' ? rawRow : {};
      const removed = new Set(Array.isArray(row.removed) ? row.removed.map((item) => String(item || '')) : []);
      const hidden = new Set(Array.isArray(row.hidden) ? row.hidden.map((item) => String(item || '')) : []);
      const visible = uniqTags((Array.isArray(row.added) ? row.added : []).map((item) => normalizeTag(item)).filter(Boolean))
        .filter((tag) => !removed.has(tag.id) && !hidden.has(tag.id) && tag.visible !== false);
      visible.forEach((tag) => {
        usage.set(tag.id, (usage.get(tag.id) || 0) + 1);
        const refs = turnUsage.get(tag.id) || [];
        refs.push({ turnKey: String(turnKey || '') });
        turnUsage.set(tag.id, refs);
      });
    });

    return Array.from(usage.entries())
      .map(([id, usageCount]) => {
        const poolRow = (pool && typeof pool === 'object' && pool[id] && typeof pool[id] === 'object') ? pool[id] : {};
        const label = normalizeLabel(poolRow.label || id);
        if (!label || !usageCount) return null;
        const color = String(poolRow.color || '').trim().toUpperCase();
        const entry = {
          id,
          label,
          color: /^#[0-9A-F]{6}$/.test(color) ? color : initialTagColor(id),
          usageCount,
          source: String(poolRow.source || 'manual'),
          createdAt: Number(poolRow.createdAt || 0) || 0,
          updatedAt: Number(poolRow.updatedAt || 0) || 0,
        };
        const refs = turnUsage.get(id) || [];
        if (refs.length) entry.turnRefs = refs;
        return entry;
      })
      .filter(Boolean)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || String(a.label || '').localeCompare(String(b.label || '')));
  }

  function listStoredChatIds() {
    const ids = new Set();
    try {
      const chatEnv = readChatCacheV2();
      Object.entries(chatEnv.chats || {}).forEach(([chatId, summary]) => {
        const id = String(chatId || '').trim();
        if (!id) return;
        if (Array.isArray(summary?.tagCatalog) && summary.tagCatalog.some((tag) => Number(tag?.usageCount || 0) > 0)) ids.add(id);
      });
      const tagEnv = readTagPoolV2();
      Object.values(tagEnv.tags || {}).forEach((bucket) => {
        Object.keys(bucket?.chats || {}).forEach((chatId) => {
          const id = String(chatId || '').trim();
          if (id) ids.add(id);
        });
      });
      Object.keys(tagEnv.chats || {}).forEach((chatId) => {
        const id = String(chatId || '').trim();
        if (id) ids.add(id);
      });
      const turnEnv = readTurnCacheV2();
      Object.keys(turnEnv.chats || {}).forEach((chatId) => {
        const id = String(chatId || '').trim();
        if (id) ids.add(id);
      });
    } catch {}
    try {
      const ls = W.localStorage;
      const prefixes = [KEY_MANUAL_PREFIX, KEY_CHAT_CACHE_PREFIX, KEY_TAG_POOL_PREFIX, KEY_TURN_CACHE_PREFIX];
      const length = Number(ls?.length || 0);
      for (let i = 0; i < length; i += 1) {
        const key = String(ls?.key(i) || '');
        const prefix = prefixes.find((item) => key.startsWith(item));
        if (!prefix) continue;
        const chatId = String(key.slice(prefix.length) || '').trim();
        if (!chatId) continue;
        if (prefix === KEY_MANUAL_PREFIX && hasManualTagEntries(chatId)) {
          ids.add(chatId);
          continue;
        }
        if (prefix === KEY_CHAT_CACHE_PREFIX) {
          const summary = readChatSummary(chatId);
          if (Array.isArray(summary?.tagCatalog) && summary.tagCatalog.some((tag) => Number(tag?.usageCount || 0) > 0)) ids.add(chatId);
          continue;
        }
        if (prefix === KEY_TAG_POOL_PREFIX || prefix === KEY_TURN_CACHE_PREFIX) {
          ids.add(chatId);
        }
      }
    } catch {}
    return Array.from(ids.values()).sort();
  }

  function getTurnKey(turnOrId) {
    const turn = turnOrId && typeof turnOrId === 'object' ? turnOrId : null;
    if (turn) {
      return normalizeId(turn.turnId || turn.answerId || turn.uid || turn.index || '');
    }
    const rawId = normalizeId(turnOrId || '');
    if (!rawId) return '';
    const resolved = getTurnRecordByAnyId(rawId);
    if (resolved) {
      return normalizeId(resolved.turnId || resolved.answerId || resolved.uid || resolved.index || rawId);
    }
    return rawId;
  }

  function getTurnRecordByAnyId(anyId) {
    const api = getTurnRuntime();
    if (!api) return null;
    const id = normalizeId(anyId);
    if (!id) return null;
    try {
      return api.getTurnById?.(id)
        || api.getTurnRecordByTurnId?.(id)
        || api.getTurnRecordByAId?.(id)
        || api.getTurnRecordByQId?.(id)
        || null;
    } catch {
      return null;
    }
  }

  function listTurns(chatId = '') {
    const api = getTurnRuntime();
    if (!api || typeof api.listTurns !== 'function') return [];
    try {
      const rows = api.listTurns() || [];
      const id = toChatId(chatId);
      if (!id) return Array.isArray(rows) ? rows : [];
      return (Array.isArray(rows) ? rows : []).filter((row) => {
        const rowChatId = toChatId(row?.chatId || row?.page?.chatId || '');
        return !rowChatId || rowChatId === id;
      });
    } catch {
      return [];
    }
  }

  function readTurnTexts(turn) {
    const out = {
      questionText: '',
      answerText: '',
      mergedText: '',
    };

    if (!turn) return out;

    const readNodeText = (node) => normalizeTextBlob(node?.innerText || node?.textContent || '');
    try { out.answerText = readNodeText(findAssistantNodeForTurn(turn)); } catch {}
    try { out.questionText = readNodeText(findQuestionNodeForTurn(turn)); } catch {}
    if (!out.questionText && turn?.questionText) out.questionText = normalizeTextBlob(turn.questionText);
    if (!out.answerText && turn?.answerText) out.answerText = normalizeTextBlob(turn.answerText);
    if (!out.answerText) {
      try { out.answerText = normalizeTextBlob(turn?.text || turn?.content || ''); } catch {}
    }

    out.mergedText = normalizeTextBlob(`${out.questionText}
${out.answerText}`);
    return out;
  }

  function normalizeTextBlob(raw = '') {
    return String(raw || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildTurnSnippet(turn) {
    try {
      const texts = readTurnTexts(turn);
      return (texts.questionText || texts.answerText || '').trim().slice(0, 120);
    } catch {
      return '';
    }
  }

  function extractKeywordsFromText(text, opts = {}) {
    const cfg = getCfg();
    const merged = normalizeTextBlob(text);
    if (!merged) return [];

    const tokens = merged
      .toLowerCase()
      .split(/[^\p{L}\p{N}\-_/]+/u)
      .map((item) => normalizeLabel(item).toLowerCase())
      .filter(Boolean)
      .filter((item) => item.length >= cfg.minTermLength)
      .filter((item) => !STOPWORDS.has(item));

    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    return Array.from(counts.entries())
      .map(([term, count]) => normalizeKeyword({ term, weight: count, source: 'auto' }))
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
      .slice(0, cfg.maxKeywordsPerTurn);
  }

  function extractCandidatePhrases(text) {
    const merged = normalizeTextBlob(text);
    if (!merged) return [];
    const phrases = [];
    const tokenRows = merged
      .split(/[\.!?\n]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);
    for (const line of tokenRows) {
      const words = line
        .split(/[^\p{L}\p{N}\-_/]+/u)
        .map((w) => normalizeLabel(w).toLowerCase())
        .filter((w) => w && w.length >= 3 && !STOPWORDS.has(w));
      for (let i = 0; i < words.length; i += 1) {
        if (words[i]) phrases.push(words[i]);
        if (i + 1 < words.length) phrases.push(`${words[i]} ${words[i + 1]}`);
        if (i + 2 < words.length && words[i].length > 2) phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
    }
    return phrases;
  }

  function scoreCandidatePhrases(questionText, answerText) {
    const candidates = new Map();
    const qPhrases = extractCandidatePhrases(questionText || '');
    const aPhrases = extractCandidatePhrases(answerText || '');
    const add = (term, score) => {
      const clean = normalizeLabel(term).toLowerCase();
      if (!clean || STOPWORDS.has(clean) || ['edit','answer','question','current','checking','direct answer'].includes(clean)) return;
      candidates.set(clean, (candidates.get(clean) || 0) + score);
    };
    qPhrases.forEach((term) => add(term, term.includes(' ') ? 2.4 : 1.1));
    aPhrases.forEach((term) => add(term, term.includes(' ') ? 3.2 : 1.4));
    qPhrases.forEach((term) => { if (aPhrases.includes(term)) add(term, 4.5); });
    return Array.from(candidates.entries())
      .map(([term, score]) => normalizeTag({ label: term, score, source: 'auto', visible: true }))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  function selectVisibleTagsFromKeywords(keywords, texts = {}) {
    const cfg = getCfg();
    const phraseTags = scoreCandidatePhrases(texts.questionText || '', texts.answerText || '');
    const fallback = (Array.isArray(keywords) ? keywords : [])
      .slice(0, cfg.visibleTagsPerTurn * 2)
      .map((kw) => normalizeTag({ label: kw.term, score: kw.weight, source: 'auto', visible: true }))
      .filter(Boolean);
    return uniqTags([...phraseTags, ...fallback]).slice(0, cfg.visibleTagsPerTurn);
  }

  function buildTurnState(chatId, turn, opts = {}) {
    const turnKey = getTurnKey(turn);
    if (!turnKey) return null;

    const mode = opts.mode || getChatMode(toChatId(chatId));
    const texts = readTurnTexts(turn);
    const textHash = stableHash(texts.mergedText || texts.answerText || '');

    let autoKeywords = [];
    let autoTags = [];
    if (mode !== TAG_MODE_MANUAL) {
      autoKeywords = extractKeywordsFromText(texts.mergedText || texts.answerText || '', opts);
      autoTags = selectVisibleTagsFromKeywords(autoKeywords, texts);
    }

    return {
      chatId: toChatId(chatId),
      turnId: normalizeId(turn?.turnId || ''),
      answerId: normalizeId(turn?.answerId || ''),
      turnKey,
      analyzedAt: Date.now(),
      textHash,
      auto: {
        tags: uniqTags(autoTags),
        keywords: uniqKeywords(autoKeywords),
      },
    };
  }

  function stableHash(raw = '') {
    const str = String(raw || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  function analyzeTurn(chatIdRaw, turnIdOrAnswerId, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    const turn = (turnIdOrAnswerId && typeof turnIdOrAnswerId === 'object')
      ? turnIdOrAnswerId
      : getTurnRecordByAnyId(turnIdOrAnswerId);

    if (!chatId) return { ok: false, status: 'missing-chat-id', state: null };
    if (!turn) return { ok: false, status: 'turn-not-found', state: null };

    const next = buildTurnState(chatId, turn, opts);
    if (!next) return { ok: false, status: 'build-failed', state: null };

    const map = readTurnCache(chatId);
    map.set(next.turnKey, next);
    writeTurnCache(chatId);

    safeDispatch(EV_TURN_ANALYZED, {
      chatId,
      turnId: next.turnId,
      answerId: next.answerId,
      turnKey: next.turnKey,
      state: next,
      ts: Date.now(),
    });

    return { ok: true, status: 'ok', state: next };
  }

  function aggregateChat(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return { ok: false, status: 'missing-chat-id', summary: null };

    const turns = listTurns(chatId);
    const map = readTurnCache(chatId);
    const tagRows = [];
    const keywordRows = [];
    const usage = new Map();
    const turnUsage = new Map(); // tagId → [{answerId, turnKey, ordinal, snippet?}]
    let turnOrdinal = 0;

    // Phase 4 side-output accumulator: per-chat phrase data, built inside the existing
    // turn loop so we don't iterate twice. phraseKey → { phrase, count, score, turnIds, lastSeenMs }.
    // Independent of chat display mode (TAG_MODE_MANUAL/AUTO/SUGGESTION) — the auto-pool is
    // a global candidate catalog and must populate even when buildTurnState skips
    // extraction (the default, since chat mode defaults to MANUAL).
    const phase4Phrases = new Map();
    let phase4TurnsProcessed = 0;
    let phase4KeywordCount = 0; // total keyword instances seen across all turns (pre-dedup)

    for (const turn of turns) {
      turnOrdinal += 1;
      const turnKey = getTurnKey(turn);
      let row = map.get(turnKey) || null;
      if (!row || opts.force === true) {
        const analyzed = analyzeTurn(chatId, turn, opts);
        row = analyzed.state || null;
      }
      if (!row) continue;
      phase4TurnsProcessed += 1;
      const answerId = normalizeId(row.answerId || turn?.answerId || '');
      const attachedTags = getAttachedVisibleTags(chatId, turnKey, row).filter((tag) => tag.visible !== false);
      if (attachedTags.length) {
        const snippet = buildTurnSnippet(turn);
        attachedTags.forEach((tag) => {
          const poolRow = ensureTagInPool(chatId, tag);
          if (poolRow) {
            usage.set(poolRow.id, (usage.get(poolRow.id) || 0) + 1);
            const refs = turnUsage.get(poolRow.id) || [];
            const ref = { answerId, turnKey, ordinal: turnOrdinal };
            if (snippet) ref.snippet = snippet;
            refs.push(ref);
            turnUsage.set(poolRow.id, refs);
          }
        });
      }
      tagRows.push(...attachedTags);
      keywordRows.push(...(row.auto?.keywords || []));

      // Phase 4 candidate sources for this turn (mode-independent):
      //   1. row.auto.keywords         — populated only when chat is in AUTO/SUGGESTION mode.
      //   2. extractKeywordsFromText() — fallback ALWAYS run when (1) is empty so candidates
      //                                   are produced even for MANUAL-mode chats.
      //   3. attachedTags              — manual + auto tags actually surfaced on this turn.
      // Combined, they form the candidate phrase set for this turn.
      const turnIdForOcc = answerId || turnKey || '';
      if (turnIdForOcc) {
        const turnLastSeen = Number(row?.analyzedAt || 0) || Date.now();
        let perTurnKeywords = Array.isArray(row.auto?.keywords) ? row.auto.keywords : [];
        if (!perTurnKeywords.length) {
          try {
            const turnTexts = readTurnTexts(turn);
            perTurnKeywords = extractKeywordsFromText(turnTexts?.mergedText || turnTexts?.answerText || '', opts) || [];
          } catch (e) { err('phase4:extract-fallback', e); perTurnKeywords = []; }
        }
        const turnPhrases = [];
        perTurnKeywords.forEach((kw) => {
          const term = String(kw?.term || '').trim();
          if (term) turnPhrases.push({ term, weight: Number(kw?.weight || 1) || 1 });
        });
        // Also include attached tag labels (manual + auto). Manual tags are first-class
        // candidates — they're phrases the user already validated.
        attachedTags.forEach((tag) => {
          const term = String(tag?.label || tag?.id || '').trim();
          if (term) turnPhrases.push({ term, weight: Number(tag?.score || 0) || 1.5 });
        });
        phase4KeywordCount += turnPhrases.length;
        turnPhrases.forEach(({ term, weight }) => {
          const phraseKey = normalizeTagKey(term);
          if (!phraseKey) return;
          const e = phase4Phrases.get(phraseKey) || { phrase: term, count: 0, score: 0, turnIds: [], lastSeenMs: turnLastSeen };
          e.count += 1;
          e.score += weight;
          if (e.turnIds.length < TAG_OCC_INDEX_TURNS_PER_PHRASE_CAP && e.turnIds.indexOf(turnIdForOcc) < 0) {
            e.turnIds.push(turnIdForOcc);
          }
          if (turnLastSeen > e.lastSeenMs) e.lastSeenMs = turnLastSeen;
          phase4Phrases.set(phraseKey, e);
        });
      }
    }

    const pool = readTagPool(chatId);
    Object.keys(pool).forEach((id) => {
      pool[id].usageCount = usage.get(id) || 0;
      pool[id].updatedAt = Date.now();
    });
    writeTagPool(chatId, pool);

    const tags = uniqTags(tagRows).slice(0, getCfg().visibleTagsPerChat).map((tag) => tag.label);
    const keywords = uniqKeywords(keywordRows).map((kw) => kw.term);
    const tagCatalog = Object.values(pool)
      .filter((row) => Number(row?.usageCount || 0) > 0)
      .map((row) => {
        const refs = turnUsage.get(row.id);
        return refs?.length ? { ...row, turnRefs: refs } : row;
      })
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || String(a.label || '').localeCompare(String(b.label || '')));

    const summary = {
      chatId,
      updatedAt: Date.now(),
      tags,
      keywords,
      tagCatalog,
      categoryCandidate: {
        primaryCategoryId: '',
        secondaryCategoryId: '',
        confidence: null,
      },
    };

    writeChatSummary(chatId, summary);

    safeDispatch(EV_CHAT_ANALYZED, {
      chatId,
      summary,
      ts: Date.now(),
    });

    // Phase 4: emit side-outputs (occurrence index + auto-pool contribution). Returns a
    // Promise so external callers (e.g., refreshTagAutoPool) can await the in-memory cache
    // update; the actual Store flush remains debounced. Stats land synchronously on
    // state.lastPhase4Stats[chatId] so even if the await is skipped, the diagnostic counts
    // are present immediately.
    try {
      const promise = emitPhase4SideOutputs(chatId, phase4Phrases, {
        turnsProcessed: phase4TurnsProcessed,
        keywordCount: phase4KeywordCount,
      });
      state.lastPhase4Promise = state.lastPhase4Promise || new Map();
      state.lastPhase4Promise.set(chatId, promise);
      promise.catch((e) => err('phase4-side-output:promise', e));
    } catch (e) { err('phase4-side-output:throw', e); }

    return { ok: true, status: 'ok', summary };
  }

  // ─── Phase 4: Tag Candidate Pool + Occurrence Index ─────────────────────────
  //
  // Two side-outputs of aggregateChat that live in the durable Library Store namespace:
  //
  //   • h2o:prm:cgx:library:tag-occ-index:v1:${chatId}  — per-chat phrase → turnIds map.
  //     Built fresh from each aggregateChat run; capped at TAG_OCC_INDEX_TURNS_PER_PHRASE_CAP
  //     turnIds per phrase. Skipped via OVERSIZE shrink path if the payload exceeds the
  //     Store's known-large-key guard (5 MB) — first by dropping low-frequency phrases,
  //     then by emitting EV_TAG_OCC_INDEX_OVERSIZE if even the shrunk payload is too big.
  //
  //   • h2o:prm:cgx:library:tag-auto-pool:v1                — global, cross-chat phrase
  //     candidate pool. Each phrase entry stores `contribByChat[chatId] = {count, score,
  //     lastSeen}`, capped at TAG_AUTO_POOL_CHATS_PER_PHRASE_CAP (FIFO by lastSeen).
  //     Re-aggregating a chat REPLACES that chat's slice — totals never drift from
  //     repeated scans of the same chat.
  //
  // Both writes are debounced and fire-and-forget. The existing per-chat tag-pool /
  // manual store / chat-summary stores are untouched.

  function createEmptyAutoPool() {
    return {
      version: 1,
      algoVersion: TAG_AUTO_POOL_ALGO_VERSION,
      phrases: {},
      updatedAt: 0,
      updatedAtIso: '',
    };
  }

  // Phase 4 hard gate: never persist auto-pool or occurrence-index data unless the Library
  // Store has a verified durable backend (bridge / chrome.storage / IndexedDB-extension /
  // IndexedDB-studio / GM). localStorage primary returns durable=false because it's the
  // quota-limited tier we are explicitly trying to escape. Read at CALL TIME — never cached
  // from boot — so Store recovery between calls promotes us automatically.
  function isStoreDurableNow() {
    try {
      const Store = W.H2O?.Library?.Store;
      if (!Store || typeof Store.caps !== 'function') return false;
      const caps = Store.caps();
      return !!(caps && caps.durable === true);
    } catch (_e) {
      return false;
    }
  }

  function ensureAutoPoolCacheLoaded() {
    if (state.autoPoolCache) return Promise.resolve(state.autoPoolCache);
    if (state.autoPoolLoadPromise) return state.autoPoolLoadPromise;
    state.autoPoolLoadPromise = (async () => {
      try {
        const Store = W.H2O?.Library?.Store;
        if (!Store) {
          state.autoPoolCache = createEmptyAutoPool();
          return state.autoPoolCache;
        }
        if (Store._readyPromise && typeof Store._readyPromise.then === 'function') {
          try { await Store._readyPromise; } catch (_e) {}
        }
        const payload = await Store.get(KEY_TAG_AUTO_POOL);
        if (payload && typeof payload === 'object' && payload.phrases && typeof payload.phrases === 'object') {
          state.autoPoolCache = {
            version: Number(payload.version || 1) || 1,
            algoVersion: String(payload.algoVersion || TAG_AUTO_POOL_ALGO_VERSION),
            phrases: payload.phrases,
            updatedAt: Number(payload.updatedAt || 0) || 0,
            updatedAtIso: String(payload.updatedAtIso || ''),
          };
        } else {
          state.autoPoolCache = createEmptyAutoPool();
        }
        return state.autoPoolCache;
      } catch (e) {
        err('auto-pool:load', e);
        state.autoPoolCache = createEmptyAutoPool();
        return state.autoPoolCache;
      }
    })();
    return state.autoPoolLoadPromise;
  }

  function shrinkOccIndex(payload) {
    // Drop phrases observed only once in this chat — the cheapest signal we have.
    const out = { ...payload, phrases: {} };
    Object.entries(payload?.phrases || {}).forEach(([key, val]) => {
      if (Number(val?.count || 0) >= TAG_OCC_INDEX_MIN_FREQ_ON_SHRINK) out.phrases[key] = val;
    });
    return out;
  }

  function shrinkAutoPool(cache) {
    // If we exceed TAG_AUTO_POOL_MAX_PHRASES, keep the top by score then count.
    const phrases = cache?.phrases || {};
    const keys = Object.keys(phrases);
    if (keys.length <= TAG_AUTO_POOL_MAX_PHRASES) return cache;
    const sorted = keys
      .map((k) => ({ k, p: phrases[k] }))
      .sort((a, b) => (Number(b.p?.score || 0) - Number(a.p?.score || 0)) || (Number(b.p?.totalCount || 0) - Number(a.p?.totalCount || 0)));
    const keep = new Set(sorted.slice(0, TAG_AUTO_POOL_MAX_PHRASES).map((x) => x.k));
    const trimmed = {};
    keys.forEach((k) => { if (keep.has(k)) trimmed[k] = phrases[k]; });
    return { ...cache, phrases: trimmed };
  }

  function scheduleAutoPoolFlush(reason = '') {
    if (!state.autoPoolCache) return;
    // Hard gate: never persist to a non-durable Store. The in-memory cache stays usable
    // for the current session, but we refuse to spill into localStorage.
    if (!isStoreDurableNow()) {
      try { W.dispatchEvent(new CustomEvent(EV_TAG_AUTO_POOL_UPDATED, { detail: { reason, persisted: false, blocked: 'store-not-durable' } })); } catch (_e) {}
      return;
    }
    if (state.autoPoolFlushTimer) return;
    const timer = W.setTimeout(async () => {
      state.autoPoolFlushTimer = 0;
      state.clean.timers.delete(timer);
      // Re-check at flush time too — the Store could have degraded between schedule + fire.
      if (!isStoreDurableNow()) {
        try { W.dispatchEvent(new CustomEvent(EV_TAG_AUTO_POOL_UPDATED, { detail: { reason, persisted: false, blocked: 'store-not-durable' } })); } catch (_e) {}
        return;
      }
      try {
        const Store = W.H2O?.Library?.Store;
        if (!Store || !state.autoPoolCache) return;
        let toWrite = state.autoPoolCache;
        try {
          await Store.set(KEY_TAG_AUTO_POOL, toWrite);
        } catch (e) {
          if (e?.code === 'OVERSIZE') {
            toWrite = shrinkAutoPool(toWrite);
            try {
              await Store.set(KEY_TAG_AUTO_POOL, toWrite);
              state.autoPoolCache = toWrite; // adopt shrunk version locally too
            } catch (e2) { err('auto-pool:flush:retry', e2); }
          } else {
            err('auto-pool:flush', e);
          }
        }
        try { W.dispatchEvent(new CustomEvent(EV_TAG_AUTO_POOL_UPDATED, { detail: { reason, phraseCount: Object.keys(state.autoPoolCache?.phrases || {}).length } })); } catch (_e) {}
      } catch (e) {
        err('auto-pool:flush:outer', e);
      }
    }, TAG_AUTO_POOL_FLUSH_DEBOUNCE_MS);
    state.autoPoolFlushTimer = timer;
    state.clean.timers.add(timer);
  }

  function scheduleOccIndexFlush(chatId, payload) {
    if (!chatId) return;
    // Hard gate: refuse to schedule a flush when Store is not durable. The pending payload
    // is dropped here on purpose — we never want stale or unpersisted occurrence indexes
    // floating in memory while consumers think a flush is in flight.
    if (!isStoreDurableNow()) {
      try { W.dispatchEvent(new CustomEvent(EV_TAG_OCC_INDEX_UPDATED, { detail: { chatId, persisted: false, blocked: 'store-not-durable' } })); } catch (_e) {}
      return;
    }
    if (!state.occIndexFlushTimers) state.occIndexFlushTimers = new Map();
    if (!state.occIndexPending) state.occIndexPending = new Map();
    state.occIndexPending.set(chatId, payload);
    const existing = state.occIndexFlushTimers.get(chatId);
    if (existing) {
      try { W.clearTimeout(existing); } catch (_e) {}
      state.clean.timers.delete(existing);
    }
    const timer = W.setTimeout(async () => {
      state.occIndexFlushTimers.delete(chatId);
      state.clean.timers.delete(timer);
      const pending = state.occIndexPending.get(chatId);
      state.occIndexPending.delete(chatId);
      if (!pending) return;
      // Re-check at flush time — Store may have degraded since the schedule call.
      if (!isStoreDurableNow()) {
        try { W.dispatchEvent(new CustomEvent(EV_TAG_OCC_INDEX_UPDATED, { detail: { chatId, persisted: false, blocked: 'store-not-durable' } })); } catch (_e) {}
        return;
      }
      try {
        const Store = W.H2O?.Library?.Store;
        if (!Store) return;
        const key = `${KEY_TAG_OCC_INDEX_PREFIX}${chatId}`;
        try {
          await Store.set(key, pending);
        } catch (e) {
          if (e?.code === 'OVERSIZE') {
            const shrunk = shrinkOccIndex(pending);
            try {
              await Store.set(key, shrunk);
            } catch (e2) {
              if (e2?.code === 'OVERSIZE') {
                try { W.dispatchEvent(new CustomEvent(EV_TAG_OCC_INDEX_OVERSIZE, { detail: { chatId, length: e2?.info?.length || 0 } })); } catch (_e) {}
              } else {
                err('occ-index:flush:retry', e2);
              }
              return;
            }
          } else {
            err('occ-index:flush', e);
            return;
          }
        }
        try { W.dispatchEvent(new CustomEvent(EV_TAG_OCC_INDEX_UPDATED, { detail: { chatId, phraseCount: Object.keys(pending?.phrases || {}).length } })); } catch (_e) {}
      } catch (e) {
        err('occ-index:flush:outer', e);
      }
    }, TAG_AUTO_POOL_FLUSH_DEBOUNCE_MS);
    state.occIndexFlushTimers.set(chatId, timer);
    state.clean.timers.add(timer);
  }

  async function emitPhase4SideOutputs(chatId, phase4Phrases, stats = {}) {
    if (!chatId) return null;
    const phrasesMap = (phase4Phrases instanceof Map) ? phase4Phrases : new Map();
    const turnsProcessed = Number(stats.turnsProcessed || 0) || 0;
    const keywordCount = Number(stats.keywordCount || 0) || 0;
    // Hard gate: when Store isn't durable we record stats so callers can see what would
    // have been written, but we do NOT touch the in-memory cache or schedule any Store
    // flushes. localStorage primary is explicitly forbidden for Phase 4 data.
    if (!isStoreDurableNow()) {
      const blockedRecord = {
        chatId,
        turnsProcessed,
        keywordCount,
        phraseCount: phrasesMap.size,
        occPhraseCount: 0,
        autoPoolPhraseCount: Object.keys(state.autoPoolCache?.phrases || {}).length,
        ts: Date.now(),
        blocked: 'store-not-durable',
      };
      state.lastPhase4Stats = state.lastPhase4Stats || new Map();
      state.lastPhase4Stats.set(chatId, blockedRecord);
      return blockedRecord;
    }
    try {
      await ensureAutoPoolCacheLoaded();

      const blocklist = (typeof getPriorityLabelTagBlocklist === 'function') ? getPriorityLabelTagBlocklist() : new Set();
      const nowMs = Date.now();

      // Build per-chat occurrence index payload — written even when empty so consumers see
      // a fresh snapshot (e.g., a chat that just had all its tags removed should not show
      // stale phrases from a previous aggregation).
      const occPhrases = {};
      phrasesMap.forEach((entry, key) => {
        occPhrases[key] = {
          turnIds: entry.turnIds.slice(0, TAG_OCC_INDEX_TURNS_PER_PHRASE_CAP),
          count: entry.count,
        };
      });
      const occPayload = {
        version: 1,
        chatId,
        algoVersion: TAG_AUTO_POOL_ALGO_VERSION,
        phrases: occPhrases,
        updatedAt: nowMs,
        updatedAtIso: new Date(nowMs).toISOString(),
      };
      scheduleOccIndexFlush(chatId, occPayload);

      // Update in-memory auto-pool. Re-aggregating REPLACES this chat's contribByChat
      // slice so totals never drift from repeat scans.
      const cache = state.autoPoolCache || createEmptyAutoPool();
      // Track which chat-slices we touched so we can still drop entries that no longer
      // contain this chat's contribution (i.e., phrases the chat used to have but lost).
      const seenInThisRun = new Set();
      phrasesMap.forEach((entry, key) => {
        seenInThisRun.add(key);
        const existing = cache.phrases[key] || {
          phrase: entry.phrase,
          contribByChat: {},
          totalCount: 0,
          chatCount: 0,
          score: 0,
          firstSeen: entry.lastSeenMs || nowMs,
          lastSeen: entry.lastSeenMs || nowMs,
          status: 'candidate',
          blocked: false,
        };
        existing.contribByChat = (existing.contribByChat && typeof existing.contribByChat === 'object') ? existing.contribByChat : {};
        existing.contribByChat[chatId] = {
          count: entry.count,
          score: Math.round(entry.score * 100) / 100,
          lastSeen: entry.lastSeenMs || nowMs,
        };
        const ids = Object.keys(existing.contribByChat);
        if (ids.length > TAG_AUTO_POOL_CHATS_PER_PHRASE_CAP) {
          const sorted = ids.sort((a, b) => Number(existing.contribByChat[b]?.lastSeen || 0) - Number(existing.contribByChat[a]?.lastSeen || 0));
          sorted.slice(TAG_AUTO_POOL_CHATS_PER_PHRASE_CAP).forEach((c) => { delete existing.contribByChat[c]; });
        }
        let totalCount = 0;
        let totalScore = 0;
        let latest = 0;
        let earliest = Infinity;
        Object.values(existing.contribByChat).forEach((c) => {
          totalCount += Number(c?.count || 0) || 0;
          totalScore += Number(c?.score || 0) || 0;
          const seen = Number(c?.lastSeen || 0) || 0;
          if (seen > latest) latest = seen;
          if (seen < earliest && seen > 0) earliest = seen;
        });
        existing.totalCount = totalCount;
        existing.chatCount = Object.keys(existing.contribByChat).length;
        existing.score = Math.round(totalScore * 100) / 100;
        if (latest) existing.lastSeen = latest;
        if (earliest !== Infinity) {
          existing.firstSeen = (existing.firstSeen && Number(existing.firstSeen) <= earliest) ? existing.firstSeen : earliest;
        } else if (!existing.firstSeen) {
          existing.firstSeen = nowMs;
        }
        existing.blocked = blocklist.has(key);
        if (existing.status !== 'approved' && existing.status !== 'rejected') existing.status = 'candidate';
        cache.phrases[key] = existing;
      });
      // Drop this chat's contribution from any phrase that USED to have it but doesn't this run
      // (so a re-aggregated chat that lost a phrase doesn't keep contributing to the pool).
      Object.entries(cache.phrases || {}).forEach(([key, val]) => {
        if (seenInThisRun.has(key)) return;
        if (!val?.contribByChat || !val.contribByChat[chatId]) return;
        delete val.contribByChat[chatId];
        // Recompute aggregates after drop.
        let totalCount = 0, totalScore = 0, latest = 0;
        Object.values(val.contribByChat).forEach((c) => {
          totalCount += Number(c?.count || 0) || 0;
          totalScore += Number(c?.score || 0) || 0;
          const seen = Number(c?.lastSeen || 0) || 0;
          if (seen > latest) latest = seen;
        });
        val.totalCount = totalCount;
        val.chatCount = Object.keys(val.contribByChat).length;
        val.score = Math.round(totalScore * 100) / 100;
        if (latest) val.lastSeen = latest;
        // If the phrase has no contributors left and isn't approved/rejected, prune it.
        if (val.chatCount === 0 && val.status === 'candidate') {
          delete cache.phrases[key];
        }
      });
      cache.updatedAt = nowMs;
      cache.updatedAtIso = new Date(nowMs).toISOString();
      cache.algoVersion = TAG_AUTO_POOL_ALGO_VERSION;
      state.autoPoolCache = cache;
      scheduleAutoPoolFlush('aggregate:' + chatId);

      // Stats: synchronous in-memory record so refreshTagAutoPool can return real counts.
      state.lastPhase4Stats = state.lastPhase4Stats || new Map();
      const statsRecord = {
        chatId,
        turnsProcessed,
        keywordCount,
        phraseCount: phrasesMap.size,
        occPhraseCount: Object.keys(occPhrases).length,
        autoPoolPhraseCount: Object.keys(cache.phrases || {}).length,
        ts: nowMs,
      };
      state.lastPhase4Stats.set(chatId, statsRecord);
      return statsRecord;
    } catch (e) {
      err('phase4-side-output:async', e);
      return null;
    }
  }

  function getTagAutoPoolSnapshot() {
    if (!state.autoPoolCache) return null;
    try { return JSON.parse(JSON.stringify(state.autoPoolCache)); }
    catch { return null; }
  }

  async function getOccurrenceIndexForChat(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return null;
    try {
      const Store = W.H2O?.Library?.Store;
      if (!Store) return null;
      return await Store.get(`${KEY_TAG_OCC_INDEX_PREFIX}${chatId}`);
    } catch (e) {
      err('occ-index:read', e);
      return null;
    }
  }

  async function findTagOccurrences(phraseRaw, opts = {}) {
    const phraseKey = normalizeTagKey(String(phraseRaw || ''));
    if (!phraseKey) return [];
    await ensureAutoPoolCacheLoaded();
    const entry = state.autoPoolCache?.phrases?.[phraseKey];
    if (!entry || !entry.contribByChat) return [];
    const filterChatId = opts?.chatId ? toChatId(opts.chatId) : '';
    const chatIds = filterChatId ? [filterChatId] : Object.keys(entry.contribByChat);
    const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(1, Math.min(2000, Math.floor(Number(opts.limit)))) : 500;
    const results = [];
    const Store = W.H2O?.Library?.Store;
    if (!Store) return results;
    for (const cId of chatIds) {
      if (results.length >= limit) break;
      try {
        const occ = await Store.get(`${KEY_TAG_OCC_INDEX_PREFIX}${cId}`);
        const turnIds = occ?.phrases?.[phraseKey]?.turnIds || [];
        for (let i = 0; i < turnIds.length && results.length < limit; i += 1) {
          results.push({ chatId: cId, turnId: turnIds[i], occurrence: i });
        }
      } catch (e) { err('find-occurrences:chat', e); }
    }
    return results;
  }

  async function refreshTagAutoPoolForChat(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return { ok: false, status: 'missing-chat-id', chatId: '', turnsProcessed: 0, keywordCount: 0, phraseCount: 0, occPhraseCount: 0, autoPoolPhraseCount: 0 };
    // Hard gate at the entry point: refuse to drive a Phase 4 refresh when Store is not
    // durable. We don't run aggregateChat here either, so we don't pay the analysis cost
    // for data we'd refuse to persist anyway.
    if (!isStoreDurableNow()) {
      const Store = W.H2O?.Library?.Store;
      let backend = null;
      try { backend = (typeof Store?.backend === 'function') ? Store.backend() : null; } catch (_e) {}
      return {
        ok: false,
        status: 'store-not-durable',
        chatId,
        turnsProcessed: 0,
        keywordCount: 0,
        phraseCount: 0,
        occPhraseCount: 0,
        autoPoolPhraseCount: Object.keys(state.autoPoolCache?.phrases || {}).length,
        backend,
        hint: 'H2O.Library.Store.caps().durable !== true — likely the bridge sentinel failed at boot (SW cold start race) or no durable adapter is available. Reload the page to re-probe; if it persists, check H2O.Library.Store.caps() and the extension SW health.',
      };
    }
    await ensureAutoPoolCacheLoaded();
    const result = aggregateChat(chatId, { force: opts?.force === true });
    // Wait for the side-output cache+stats to settle (in-memory only — Store flush is still
    // debounced and continues in the background).
    const sideOutputPromise = state.lastPhase4Promise && state.lastPhase4Promise.get(chatId);
    if (sideOutputPromise && typeof sideOutputPromise.then === 'function') {
      try { await sideOutputPromise; } catch (_e) {}
    }
    const stats = (state.lastPhase4Stats && state.lastPhase4Stats.get(chatId)) || {
      turnsProcessed: 0, keywordCount: 0, phraseCount: 0, occPhraseCount: 0,
      autoPoolPhraseCount: Object.keys(state.autoPoolCache?.phrases || {}).length,
    };
    let status = result?.status || (result?.ok ? 'ok' : 'error');
    // Surface clearer status when the chat had no candidate signal at all, OR when the
    // side-output emit re-discovered Store had degraded between entry and flush time.
    if (stats.blocked === 'store-not-durable') status = 'store-not-durable';
    else if (status === 'ok') {
      if (stats.turnsProcessed === 0) status = 'no-turns';
      else if (stats.keywordCount === 0) status = 'no-keywords';
    }
    return {
      ok: !!result?.ok && status !== 'store-not-durable',
      status,
      chatId,
      turnsProcessed: stats.turnsProcessed,
      keywordCount: stats.keywordCount,
      phraseCount: stats.phraseCount,
      occPhraseCount: stats.occPhraseCount,
      autoPoolPhraseCount: stats.autoPoolPhraseCount,
    };
  }

  function getTagAutoPoolDiagnostics() {
    const Store = W.H2O?.Library?.Store;
    let backend = null;
    let durable = null;
    try {
      backend = (typeof Store?.backend === 'function') ? Store.backend() : null;
      const caps = (typeof Store?.caps === 'function') ? Store.caps() : null;
      durable = !!caps?.durable;
    } catch (_e) {}
    const cache = state.autoPoolCache;
    return {
      cacheLoaded: !!cache,
      phraseCount: cache ? Object.keys(cache.phrases || {}).length : 0,
      algoVersion: cache?.algoVersion || TAG_AUTO_POOL_ALGO_VERSION,
      backend,
      durable,
      autoPoolKey: KEY_TAG_AUTO_POOL,
      occIndexKeyPrefix: KEY_TAG_OCC_INDEX_PREFIX,
      pendingOccFlushes: state.occIndexPending ? state.occIndexPending.size : 0,
      pendingPoolFlush: !!state.autoPoolFlushTimer,
      lastUpdatedAtIso: cache?.updatedAtIso || '',
    };
  }

  async function projectChatMetadata(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return { ok: false, status: 'missing-chat-id' };

    const archive = getArchiveBoot();
    // Use already-written summary (aggregateChat runs before us in refreshChatSummaryAndProject);
    // only re-aggregate if the cache is genuinely missing.
    const summary = readChatSummary(chatId) || aggregateChat(chatId, opts).summary || null;
    if (!summary) return { ok: false, status: 'missing-summary' };

    const patch = {
      tags: Array.isArray(summary.tags) ? summary.tags : [],
      keywords: Array.isArray(summary.keywords) ? summary.keywords : [],
      tagCatalog: Array.isArray(summary.tagCatalog) ? summary.tagCatalog : [],
    };

    // IMPORTANT:
    // archiveBoot.upsertLatestSnapshotMeta is available in newer archive engine builds.
    // Keep the runtime guard below so this module still fails safely if load order or older builds
    // temporarily leave the seam unavailable.
    const upsert = archive?.upsertLatestSnapshotMeta || archive?._rendererHost?.upsertLatestSnapshotMeta || null;
    if (typeof upsert !== 'function') {
      return {
        ok: false,
        status: 'archive-meta-write-api-missing',
        chatId,
        patch,
      };
    }

    try {
      const res = await upsert(chatId, patch, { source: 'tags' });
      safeDispatch(EV_TAGS_CHANGED, { chatId, patch, source: 'projectChatMetadata', ts: Date.now() });
      return { ok: true, status: 'ok', chatId, patch, res };
    } catch (e) {
      err('projectChatMetadata', e);
      return { ok: false, status: 'archive-meta-write-failed', chatId, patch, error: String(e?.message || e || '') };
    }
  }

  function getTurnState(chatIdRaw, turnIdOrAnswerId) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnIdOrAnswerId);
    if (!chatId || !turnKey) return null;
    return readTurnCache(chatId).get(turnKey) || null;
  }

  function ensureTurnState(chatIdRaw, turnIdOrAnswerId, opts = {}) {
    const existing = getTurnState(chatIdRaw, turnIdOrAnswerId);
    if (existing && opts.force !== true) return { ok: true, status: 'cached', state: existing };
    return analyzeTurn(chatIdRaw, turnIdOrAnswerId, opts);
  }

  function getChatSummary(chatIdRaw) {
    return readChatSummary(chatIdRaw);
  }

  function mutateManual(chatIdRaw, turnIdOrAnswerId, mutateFn) {
    const chatId = toChatId(chatIdRaw);
    const runtimeTurn = (turnIdOrAnswerId && typeof turnIdOrAnswerId === 'object')
      ? turnIdOrAnswerId
      : getTurnRecordByAnyId(turnIdOrAnswerId);
    const turnKey = getTurnKey(runtimeTurn || turnIdOrAnswerId);
    if (!chatId || !turnKey) return { ok: false, status: 'invalid-target' };

    const store = readManualStore(chatId);
    const row = (store[turnKey] && typeof store[turnKey] === 'object') ? { ...store[turnKey] } : {};
    const next = (typeof mutateFn === 'function' ? mutateFn(row) : row) || row;
    store[turnKey] = next;
    writeManualStore(chatId, store);

    const analyzed = analyzeTurn(chatId, runtimeTurn || turnIdOrAnswerId, { reason: 'manual-mutation' });
    const answerId = normalizeId(analyzed?.state?.answerId || runtimeTurn?.answerId || turnIdOrAnswerId);
    if (answerId) {
      const turnNode = runtimeTurn?.answerEl || runtimeTurn?.node || findAssistantNodeForTurn(runtimeTurn || {}) || null;
      attachTurnUi(turnNode, answerId, { chatId, reason: 'manual-mutation' });
    }
    refreshChatSummaryAndProject(chatId, { reason: 'manual-mutation' });
    safeDispatch(EV_TAGS_CHANGED, {
      chatId,
      turnKey,
      answerId,
      state: analyzed?.state || null,
      source: 'manual',
      ts: Date.now(),
    });
    return { ok: true, status: 'ok', state: analyzed?.state || null };
  }

  function setManualTags(chatIdRaw, turnIdOrAnswerId, tags) {
    return mutateManual(chatIdRaw, turnIdOrAnswerId, (row) => ({
      ...row,
      added: (Array.isArray(tags) ? tags : []).map((item) => normalizeTag({ ...item, source: 'manual' })).filter(Boolean),
      removed: [],
      pinned: Array.isArray(row.pinned) ? row.pinned : [],
      hidden: Array.isArray(row.hidden) ? row.hidden : [],
    }));
  }

  function addManualTag(chatIdRaw, turnIdOrAnswerId, tag) {
    const chatId = toChatId(chatIdRaw);
    const ensured = ensureTagInPool(chatId, tag);
    return mutateManual(chatId, turnIdOrAnswerId, (row) => {
      const next = normalizeTag({ ...(ensured || tag), source: tag?.source || ensured?.source || 'manual' });
      const added = Array.isArray(row.added) ? row.added.slice() : [];
      if (next && !added.some((item) => String(item?.id || '') === next.id)) added.push(next);
      return { ...row, added, removed: Array.isArray(row.removed) ? row.removed : [], pinned: Array.isArray(row.pinned) ? row.pinned : [], hidden: Array.isArray(row.hidden) ? row.hidden : [] };
    });
  }

  function removeManualTag(chatIdRaw, turnIdOrAnswerId, tagIdOrLabel) {
    return mutateManual(chatIdRaw, turnIdOrAnswerId, (row) => {
      const id = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
      const removed = new Set(Array.isArray(row.removed) ? row.removed : []);
      if (id) removed.add(id);
      return { ...row, removed: Array.from(removed), added: Array.isArray(row.added) ? row.added : [], pinned: Array.isArray(row.pinned) ? row.pinned : [], hidden: Array.isArray(row.hidden) ? row.hidden : [] };
    });
  }

  function pinTag(chatIdRaw, turnIdOrAnswerId, tagIdOrLabel) {
    return mutateManual(chatIdRaw, turnIdOrAnswerId, (row) => {
      const id = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
      const pinned = new Set(Array.isArray(row.pinned) ? row.pinned : []);
      if (id) pinned.add(id);
      return { ...row, pinned: Array.from(pinned), added: Array.isArray(row.added) ? row.added : [], removed: Array.isArray(row.removed) ? row.removed : [], hidden: Array.isArray(row.hidden) ? row.hidden : [] };
    });
  }

  function hideTag(chatIdRaw, turnIdOrAnswerId, tagIdOrLabel) {
    return mutateManual(chatIdRaw, turnIdOrAnswerId, (row) => {
      const id = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
      const hidden = new Set(Array.isArray(row.hidden) ? row.hidden : []);
      if (id) hidden.add(id);
      return { ...row, hidden: Array.from(hidden), added: Array.isArray(row.added) ? row.added : [], removed: Array.isArray(row.removed) ? row.removed : [], pinned: Array.isArray(row.pinned) ? row.pinned : [] };
    });
  }

  function acceptSuggestion(chatIdRaw, turnIdOrAnswerId, suggestionIdOrLabel) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnIdOrAnswerId);
    const id = slugify(suggestionIdOrLabel) || String(suggestionIdOrLabel || '').trim().toLowerCase();
    const items = getTurnSuggestions(chatId, turnKey);
    const item = items.find((row) => row.id === id || row.label === suggestionIdOrLabel) || null;
    if (!chatId || !turnKey || !item) return { ok: false, status: 'suggestion-not-found' };
    const res = addManualTag(chatId, turnKey, { id: item.id, label: item.label, score: item.score, source: 'suggestion' });
    markSuggestionStatus(chatId, turnKey, item.id, 'accepted');
    refreshChatSummaryAndProject(chatId, { reason: 'accept-suggestion' });
    return { ok: true, status: 'ok', state: res?.state || null };
  }

  function dismissSuggestion(chatIdRaw, turnIdOrAnswerId, suggestionIdOrLabel) {
    const chatId = toChatId(chatIdRaw);
    const turnKey = getTurnKey(turnIdOrAnswerId);
    if (!chatId || !turnKey) return { ok: false, status: 'invalid-target' };
    markSuggestionStatus(chatId, turnKey, suggestionIdOrLabel, 'dismissed');
    refreshChatSummaryAndProject(chatId, { reason: 'dismiss-suggestion', project: false });
    return { ok: true, status: 'ok' };
  }

  const KEY_PENDING_TURN_NAV = 'h2o:tags:pending-turn-nav:v1';

  function getTagUsageIndex(chatIdRaw) {
    return getChatTagCatalog(toChatId(chatIdRaw));
  }

  function getTagUsageRefs(chatIdRaw, tagIdOrLabel) {
    const chatId = toChatId(chatIdRaw);
    const tagId = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
    if (!chatId || !tagId) return [];
    const entry = getChatTagCatalog(chatId).find((row) => String(row?.id || '') === tagId);
    return Array.isArray(entry?.turnRefs) ? entry.turnRefs : [];
  }

  function scrollToAnswerInDom(answerId, opts = {}) {
    const esc = cssEscapeValue(answerId);
    const el =
      D.querySelector(`[data-message-id="${esc}"][data-message-author-role="assistant"]`)
      || D.querySelector(`[data-message-id="${esc}"]`)
      || null;
    if (!el) return { ok: false, status: 'element-not-found' };
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    if (opts.highlight) {
      try {
        const prev = el.style.outline;
        el.style.outline = '2px solid rgba(100,150,255,0.45)';
        const ht = W.setTimeout(() => {
          state.clean.timers.delete(ht);
          try { el.style.outline = prev; } catch {}
        }, 2000);
        state.clean.timers.add(ht);
      } catch {}
    }
    return { ok: true, status: 'scrolled' };
  }

  function openTurnByRef(chatIdRaw, answerIdOrKey, opts = {}) {
    const targetChatId = toChatId(chatIdRaw);
    const targetAnswerId = normalizeId(answerIdOrKey);
    if (!targetChatId || !targetAnswerId) return { ok: false, status: 'invalid-ref' };
    const currentChatId = toChatId();
    if (targetChatId === currentChatId) {
      return scrollToAnswerInDom(targetAnswerId, { highlight: true });
    }
    try {
      W.sessionStorage?.setItem(KEY_PENDING_TURN_NAV, JSON.stringify({
        chatId: targetChatId,
        answerId: targetAnswerId,
        ts: Date.now(),
      }));
    } catch {}
    try { W.location.href = `/c/${encodeURIComponent(targetChatId)}`; } catch {}
    return { ok: true, status: 'navigating', chatId: targetChatId, answerId: targetAnswerId };
  }

  function checkPendingTurnNav() {
    try {
      const raw = W.sessionStorage?.getItem(KEY_PENDING_TURN_NAV);
      if (!raw) return false;
      const target = JSON.parse(raw) || null;
      if (!target?.chatId || !target?.answerId) {
        try { W.sessionStorage.removeItem(KEY_PENDING_TURN_NAV); } catch {}
        return false;
      }
      if (Date.now() - Number(target.ts || 0) > 30000) {
        try { W.sessionStorage.removeItem(KEY_PENDING_TURN_NAV); } catch {}
        return false;
      }
      const currentChatId = toChatId();
      if (currentChatId !== target.chatId) return false;
      try { W.sessionStorage.removeItem(KEY_PENDING_TURN_NAV); } catch {}
      const timer = W.setTimeout(() => {
        state.clean.timers.delete(timer);
        scrollToAnswerInDom(target.answerId, { highlight: true });
      }, 500);
      state.clean.timers.add(timer);
      return true;
    } catch {
      return false;
    }
  }

  function closeTagEditPopup() {
    try { state.openTagEditPopup?.remove?.(); } catch {}
    state.openTagEditPopup = null;
  }

  function openTagEditPopup(anchorEl, tagRecord, chatIdRaw, afterChange = null, opts = {}) {
    if (!(anchorEl instanceof HTMLElement) || !tagRecord) return null;
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return null;
    closeTagEditPopup();
    closeTagPoolPopup();
    const pop = D.createElement('div');
    const rect = anchorEl.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.left = `${Math.max(8, rect.left)}px`;
    pop.style.top = `${Math.min(W.innerHeight - 220, rect.bottom + 8)}px`;
    pop.style.zIndex = '2147483647';
    pop.style.padding = '10px';
    pop.style.minWidth = '240px';
    pop.style.borderRadius = '14px';
    pop.style.background = 'rgba(20,20,20,.98)';
    pop.style.border = '1px solid rgba(255,255,255,.12)';
    pop.style.boxShadow = '0 18px 60px rgba(0,0,0,.45)';
    const title = D.createElement('div');
    title.textContent = tagRecord.label || tagRecord.id || 'Tag';
    title.style.fontWeight = '600';
    title.style.marginBottom = '10px';
    pop.appendChild(title);
    const grid = D.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(6, 28px)';
    grid.style.gap = '8px';
    TAG_COLOR_PALETTE.forEach((color) => {
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.style.width = '28px'; btn.style.height = '28px'; btn.style.borderRadius = '8px'; btn.style.border = '1px solid rgba(255,255,255,.16)'; btn.style.background = color; btn.style.cursor = 'pointer';
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        setTagColor(chatId, tagRecord.id, color);
        closeTagEditPopup();
        try { afterChange?.(); } catch {}
      };
      grid.appendChild(btn);
    });
    pop.appendChild(grid);
    const rename = D.createElement('button');
    rename.type = 'button';
    rename.textContent = 'Rename';
    rename.style.marginTop = '10px';
    rename.style.padding = '8px 10px';
    rename.style.borderRadius = '10px';
    rename.style.border = '1px solid rgba(255,255,255,.12)';
    rename.style.background = 'rgba(255,255,255,.05)';
    rename.style.color = 'white';
    rename.style.cursor = 'pointer';
    rename.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      let nextLabel = '';
      try { nextLabel = W.prompt?.('Rename tag', String(tagRecord.label || '')) || ''; } catch {}
      if (!nextLabel) return;
      renameTagInPool(chatId, tagRecord.id, nextLabel);
      closeTagEditPopup();
      try { afterChange?.(); } catch {}
    };
    pop.appendChild(rename);
    if (typeof opts.onRemove === 'function') {
      const removeBtn = D.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove from turn';
      removeBtn.style.display = 'block';
      removeBtn.style.width = '100%';
      removeBtn.style.marginTop = '8px';
      removeBtn.style.padding = '8px 10px';
      removeBtn.style.borderRadius = '10px';
      removeBtn.style.border = '1px solid rgba(255,80,80,.35)';
      removeBtn.style.background = 'rgba(255,60,60,.08)';
      removeBtn.style.color = 'rgba(255,130,130,1)';
      removeBtn.style.cursor = 'pointer';
      removeBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        closeTagEditPopup();
        try { opts.onRemove(); } catch {}
        try { afterChange?.(); } catch {}
      };
      pop.appendChild(removeBtn);
    }
    const onDoc = (e) => {
      if (pop.contains(e.target) || anchorEl.contains(e.target)) return;
      D.removeEventListener('mousedown', onDoc, true);
      closeTagEditPopup();
    };
    D.addEventListener('mousedown', onDoc, true);
    D.body.appendChild(pop);
    state.openTagEditPopup = pop;
    return pop;
  }

  function ensureStyle() {
    const existing = D.getElementById(CSS_STYLE_ID);
    const css = `
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_PILL}"]{
        all: unset;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 20px;
        padding: 0 8px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 11px;
        line-height: 1;
        color: rgba(255,255,255,.85);
        background: rgba(255,255,255,.08);
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_PILL}"]:hover{
        background: rgba(255,255,255,.12);
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_TRAY}"]{
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_CHIP}"]{
        display: inline-flex;
        align-items: center;
        height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: 11px;
        color: rgba(255,255,255,.9);
        background: rgba(255,255,255,.08);
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_EDIT}"]{
        all: unset;
        display: inline-flex;
        align-items: center;
        height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 11px;
        color: rgba(255,255,255,.78);
        background: rgba(255,255,255,.05);
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_ADD_DOT}"]{
        all: unset;
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        cursor: pointer;
        color: rgba(255,255,255,.9);
        background: rgba(255,255,255,.08);
        border: 1px dashed rgba(255,255,255,.18);
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_EMPTY}"]{
        font-size: 11px;
        color: rgba(255,255,255,.58);
        padding: 2px 0;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_POP}"]{
        min-width: 260px;
        max-width: 360px;
        padding: 10px;
        border-radius: 14px;
        background: rgba(20,20,20,.98);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 18px 60px rgba(0,0,0,.45);
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_FSECTION_VIEWER}"]{
        position: fixed;
        inset: 72px 18px 18px auto;
        width: min(520px, calc(100vw - 36px));
        z-index: 2147483646;
        color: var(--text-primary, rgba(255,255,255,.92));
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_FSECTION_VIEWER}"] [${ATTR_CGXUI_STATE}="page"],
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_FSECTION_PAGE}"]{
        box-sizing: border-box;
        min-height: 0;
        background: var(--main-surface-primary, rgba(18,18,18,.98));
        border: 1px solid var(--border-default, rgba(255,255,255,.12));
        border-radius: 16px;
        box-shadow: 0 18px 60px rgba(0,0,0,.36);
        overflow: hidden;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_FSECTION_PAGE}"]{
        color: var(--text-primary, rgba(255,255,255,.92));
        border: 0;
        border-radius: 0;
        box-shadow: none;
        background: transparent;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="top"]{
        border-bottom: 1px solid var(--border-default, rgba(255,255,255,.10));
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="head"]{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="title-row"]{
        display: flex;
        align-items: center;
        gap: 10px;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="title"],
      [${ATTR_CGXUI_OWNER}="${SkID}"] h1{
        margin: 0;
        font-size: 18px;
        font-weight: 650;
        line-height: 1.2;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="sub"]{
        margin-top: 3px;
        font-size: 12px;
        color: var(--text-secondary, rgba(255,255,255,.62));
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="panel-icon"],
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="title-icon"]{
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="panel-icon"] svg,
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="title-icon"] svg{
        width: 20px;
        height: 20px;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="close"]{
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        opacity: .72;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="tabs"]{
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px 12px;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="tab"],
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="view-action"]{
        border: 1px solid var(--border-default, rgba(255,255,255,.12));
        border-radius: 999px;
        padding: 5px 10px;
        background: rgba(255,255,255,.08);
        color: inherit;
        font-size: 12px;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="list"]{
        margin: 0;
        padding: 0 16px 14px;
        list-style: none;
        overflow: auto;
      }
      [${ATTR_CGXUI_OWNER}="${SkID}"] [${ATTR_CGXUI_STATE}="category-button"]{
        all: unset;
        box-sizing: border-box;
        cursor: pointer;
      }
    `;
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css;
      return existing;
    }
    const style = D.createElement('style');
    style.id = CSS_STYLE_ID;
    style.textContent = css;
    D.documentElement.appendChild(style);
    state.clean.nodes.add(style);
    return style;
  }

  function getOrCreatePill(barEl, answerId) {
    if (!(barEl instanceof HTMLElement)) return null;
    let pill = barEl.querySelector(`[${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_PILL}"]`);
    if (pill) return pill;
    pill = D.createElement('button');
    pill.type = 'button';
    pill.setAttribute(ATTR_CGXUI_OWNER, SkID);
    pill.setAttribute(ATTR_CGXUI, UI_TAG_PILL);
    pill.setAttribute(ATTR_ANSWER_ID, normalizeId(answerId));
    pill.textContent = '#';
    barEl.appendChild(pill);
    return pill;
  }


  function closeTagPoolPopup() {
    try { state.openPopup?.remove?.(); } catch {}
    state.openPopup = null;
    return true;
  }

  function addPoolTagToTurn(chatIdRaw, turnIdOrAnswerId, tagIdOrLabel) {
    const chatId = toChatId(chatIdRaw);
    const tagId = slugify(tagIdOrLabel) || String(tagIdOrLabel || '').trim().toLowerCase();
    const pool = readTagPool(chatId);
    const row = pool[tagId];
    if (!row) return { ok: false, status: 'tag-not-found' };
    return addManualTag(chatId, turnIdOrAnswerId, { id: row.id, label: row.label, source: 'manual', score: 999 });
  }

  function createAndAddTagToTurn(chatIdRaw, turnIdOrAnswerId, label) {
    const chatId = toChatId(chatIdRaw);
    const tag = normalizeTag({ label, source: 'manual', score: 999 });
    if (!chatId || !tag) return { ok: false, status: 'invalid-tag' };
    ensureTagInPool(chatId, tag);
    return addManualTag(chatId, turnIdOrAnswerId, tag);
  }

  function removeTurnTag(chatIdRaw, turnIdOrAnswerId, tagIdOrLabel) {
    return removeManualTag(chatIdRaw, turnIdOrAnswerId, tagIdOrLabel);
  }

  function openTagPoolPopup(anchorEl, chatIdRaw, turnIdOrAnswerId) {
    const chatId = toChatId(chatIdRaw);
    if (!(anchorEl instanceof HTMLElement) || !chatId) return null;
    closeTagPoolPopup();
    const turnKey = getTurnKey(turnIdOrAnswerId);
    const pop = D.createElement('div');
    pop.setAttribute(ATTR_CGXUI_OWNER, SkID);
    pop.setAttribute(ATTR_CGXUI, UI_TAG_POP);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.left = `${Math.max(8, rect.left)}px`;
    pop.style.top = `${Math.min(W.innerHeight - 220, rect.bottom + 8)}px`;
    pop.style.zIndex = '2147483647';
    const title = D.createElement('div');
    title.textContent = 'Add tag';
    title.style.opacity = '.7';
    title.style.fontSize = '12px';
    title.style.marginBottom = '8px';
    pop.appendChild(title);
    const chips = D.createElement('div');
    chips.style.display = 'flex';
    chips.style.flexWrap = 'wrap';
    chips.style.gap = '6px';
    const mode = getChatMode(chatId);
    const turnSuggestions = (mode === TAG_MODE_MANUAL) ? [] : getTurnSuggestions(chatId, turnKey).filter((item) => item.status !== 'accepted' && item.status !== 'dismissed');
    if (turnSuggestions.length) {
      const sTitle = D.createElement('div');
      sTitle.textContent = 'Suggested';
      sTitle.style.fontSize = '11px';
      sTitle.style.opacity = '.7';
      sTitle.style.marginBottom = '8px';
      pop.appendChild(sTitle);
      const sWrap = D.createElement('div');
      sWrap.style.display = 'flex';
      sWrap.style.flexWrap = 'wrap';
      sWrap.style.gap = '6px';
      turnSuggestions.forEach((item) => {
        const sBtn = D.createElement('button');
        sBtn.type = 'button';
        sBtn.setAttribute(ATTR_CGXUI_OWNER, SkID);
        sBtn.setAttribute(ATTR_CGXUI, UI_TAG_CHIP);
        sBtn.textContent = item.label;
        sBtn.style.opacity = '.88';
        sBtn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          acceptSuggestion(chatId, turnKey, item.id);
          closeTagPoolPopup();
          closeTurnUi(normalizeId(turnIdOrAnswerId));
          openTurnUi(chatId, turnIdOrAnswerId, { source: 'suggestion-accept' });
        };
        sWrap.appendChild(sBtn);
      });
      pop.appendChild(sWrap);
      const hr = D.createElement('div');
      hr.style.height = '1px'; hr.style.margin = '10px 0'; hr.style.background = 'rgba(255,255,255,.08)';
      pop.appendChild(hr);
    }
    const attachedIdsInPool = new Set(getAttachedVisibleTags(chatId, turnKey).map((t) => t.id));
    for (const tag of listTagPool(chatId)) {
      if (attachedIdsInPool.has(tag.id)) continue;
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
      btn.setAttribute(ATTR_CGXUI, UI_TAG_CHIP);
      btn.textContent = tag.label;
      btn.style.background = `${tag.color}22`;
      btn.style.border = `1px solid ${tag.color}66`;
      btn.style.color = tag.color;
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        addPoolTagToTurn(chatId, turnKey, tag.id);
        closeTagPoolPopup();
        closeTurnUi(normalizeId(turnIdOrAnswerId));
        openTurnUi(chatId, turnIdOrAnswerId, { source: 'pool-add' });
      };
      chips.appendChild(btn);
    }
    pop.appendChild(chips);
    const inputWrap = D.createElement('div');
    inputWrap.style.display = 'flex';
    inputWrap.style.gap = '8px';
    inputWrap.style.marginTop = '10px';
    const input = D.createElement('input');
    input.type = 'text';
    input.placeholder = 'New tag';
    input.style.flex = '1 1 auto';
    input.style.background = 'rgba(255,255,255,.06)';
    input.style.border = '1px solid rgba(255,255,255,.12)';
    input.style.borderRadius = '10px';
    input.style.color = 'white';
    input.style.padding = '8px 10px';
    const addBtn = D.createElement('button');
    addBtn.type = 'button';
    addBtn.setAttribute(ATTR_CGXUI_OWNER, SkID);
    addBtn.setAttribute(ATTR_CGXUI, UI_TAG_EDIT);
    addBtn.textContent = 'Add';
    addBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const value = normalizeLabel(input.value);
      if (!value) return;
      createAndAddTagToTurn(chatId, turnKey, value);
      closeTagPoolPopup();
      closeTurnUi(normalizeId(turnIdOrAnswerId));
      openTurnUi(chatId, turnIdOrAnswerId, { source: 'new-add' });
    };
    inputWrap.appendChild(input); inputWrap.appendChild(addBtn); pop.appendChild(inputWrap);
    const onDoc = (e) => {
      if (pop.contains(e.target) || anchorEl.contains(e.target)) return;
      D.removeEventListener('mousedown', onDoc, true);
      closeTagPoolPopup();
    };
    D.addEventListener('mousedown', onDoc, true);
    D.body.appendChild(pop);
    state.openPopup = pop;
    try { input.focus(); } catch {}
    return pop;
  }

  function closeTurnUi(answerIdRaw) {
    const answerId = normalizeId(answerIdRaw);
    const tray = state.openTrays.get(answerId) || null;
    if (tray?.remove) tray.remove();
    state.openTrays.delete(answerId);
    safeDispatch(EV_TURN_UI_CLOSE, { answerId, ts: Date.now() });
    return true;
  }

  function openTurnUi(chatIdRaw, turnIdOrAnswerId, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    const turn = (turnIdOrAnswerId && typeof turnIdOrAnswerId === 'object')
      ? turnIdOrAnswerId
      : getTurnRecordByAnyId(turnIdOrAnswerId);
    if (!chatId || !turn) return { ok: false, status: 'turn-not-found' };

    const answerId = normalizeId(turn.answerId || turn.turnId || '');
    const turnKey = getTurnKey(turn);
    const titleApi = getTitleApi();
    const ensured = titleApi?.ensureBar?.(answerId) || null;
    const bar = ensured?.bar || titleApi?.getBar?.(answerId) || null;
    if (!(bar instanceof HTMLElement)) return { ok: false, status: 'title-bar-missing' };

    closeTurnUi(answerId);

    const mode = getChatMode(chatId);
    const cached = getTurnState(chatId, turnKey);
    const texts = readTurnTexts(turn);
    const currentHash = stableHash(texts.mergedText || texts.answerText || '');
    const forceRe = mode !== TAG_MODE_MANUAL && cached?.textHash !== currentHash;
    const record = ensureTurnState(chatId, turn, { reason: 'tray-open', force: forceRe, mode }).state || null;
    const candidates = mode !== TAG_MODE_MANUAL ? buildSuggestionCandidates(chatId, turnKey, record) : [];
    if (candidates.length) setTurnSuggestions(chatId, turnKey, candidates);
    const autoAccepted = (mode === TAG_MODE_AUTO) ? maybeAutoAttachSuggestions(chatId, turnKey, candidates) : [];

    const attachedTags = getAttachedVisibleTags(chatId, turnKey, record);
    const pendingSuggestions = (mode === TAG_MODE_MANUAL) ? [] : getTurnSuggestions(chatId, turnKey).filter((item) => item.status === 'pending');

    const tray = D.createElement('div');
    tray.setAttribute(ATTR_CGXUI_OWNER, SkID);
    tray.setAttribute(ATTR_CGXUI, UI_TAG_TRAY);
    tray.setAttribute(ATTR_CHAT_ID, chatId);
    tray.setAttribute(ATTR_TURN_ID, normalizeId(turn.turnId || ''));
    tray.setAttribute(ATTR_ANSWER_ID, answerId);
    tray.style.display = 'block';
    tray.style.width = '100%';
    tray.style.flexBasis = '100%';
    tray.style.marginTop = '8px';
    tray.style.alignSelf = 'stretch';

    const chipsRow = D.createElement('div');
    chipsRow.style.display = 'flex';
    chipsRow.style.flexWrap = 'wrap';
    chipsRow.style.justifyContent = 'flex-start';
    chipsRow.style.alignItems = 'center';
    chipsRow.style.gap = '6px';
    chipsRow.style.width = '100%';
    if (!attachedTags.length) {
      const empty = D.createElement('span');
      empty.setAttribute(ATTR_CGXUI_OWNER, SkID);
      empty.setAttribute(ATTR_CGXUI, UI_TAG_EMPTY);
      empty.textContent = 'No tags yet';
      chipsRow.appendChild(empty);
    }
    for (const tag of attachedTags) {
      const chip = D.createElement('button');
      chip.type = 'button';
      chip.setAttribute(ATTR_CGXUI_OWNER, SkID);
      chip.setAttribute(ATTR_CGXUI, UI_TAG_CHIP);
      chip.textContent = tag.label;
      const color = getTagColor(chatId, tag.id);
      chip.style.background = `${color}22`;
      chip.style.border = `1px solid ${color}66`;
      chip.style.color = color;
      chip.title = tag.label;
      chip.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const poolRecord = readTagPool(chatId)[tag.id] || { id: tag.id, label: tag.label };
        openTagEditPopup(chip, poolRecord, chatId, () => {
          closeTurnUi(answerId);
          openTurnUi(chatId, answerId, { source: 'tag-edit' });
        }, {
          onRemove: () => {
            removeTurnTag(chatId, answerId, tag.id);
            closeTurnUi(answerId);
            openTurnUi(chatId, answerId, { source: 'remove-tag' });
          },
        });
      };
      chipsRow.appendChild(chip);
    }
    const dot = D.createElement('button');
    dot.type = 'button';
    dot.setAttribute(ATTR_CGXUI_OWNER, SkID);
    dot.setAttribute(ATTR_CGXUI, UI_TAG_ADD_DOT);
    dot.textContent = '•';
    dot.title = 'Add tag';
    dot.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      openTagPoolPopup(dot, chatId, answerId);
    };
    chipsRow.appendChild(dot);
    tray.appendChild(chipsRow);

    if (mode !== TAG_MODE_MANUAL && pendingSuggestions.length) {
      const sLabel = D.createElement('div');
      sLabel.setAttribute(ATTR_CGXUI_OWNER, SkID);
      sLabel.setAttribute(ATTR_CGXUI, UI_TAG_EMPTY);
      sLabel.textContent = 'Suggested';
      sLabel.style.marginTop = '8px';
      tray.appendChild(sLabel);
      const sRow = D.createElement('div');
      sRow.style.display = 'flex';
      sRow.style.flexWrap = 'wrap';
      sRow.style.justifyContent = 'flex-start';
      sRow.style.alignItems = 'center';
      sRow.style.gap = '6px';
      sRow.style.width = '100%';
      pendingSuggestions.forEach((item) => {
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
        btn.setAttribute(ATTR_CGXUI, UI_TAG_CHIP);
        btn.textContent = item.label;
        btn.style.opacity = '.88';
        btn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          acceptSuggestion(chatId, answerId, item.id);
          closeTurnUi(answerId);
          openTurnUi(chatId, answerId, { source: 'accept-suggestion' });
        };
        sRow.appendChild(btn);
      });
      tray.appendChild(sRow);
    }

    bar.insertAdjacentElement('afterend', tray);
    state.openTrays.set(answerId, tray);
    if (autoAccepted.length > 0) refreshChatSummaryAndProject(chatId, { reason: 'auto-attach-on-open' });

    safeDispatch(EV_TURN_UI_OPEN, {
      chatId,
      turnId: normalizeId(turn.turnId || ''),
      answerId,
      ts: Date.now(),
    });

    return { ok: true, status: 'ok', tray, state: record };
  }

  function attachTurnUi(msgEl, answerIdRaw, opts = {}) {
    const answerId = normalizeId(answerIdRaw);
    const titleApi = getTitleApi();
    if (!titleApi || !answerId) return { ok: false, status: 'title-api-unavailable' };

    const ensured = titleApi.ensureBar?.(answerId) || null;
    const bar = ensured?.bar || titleApi.getBar?.(answerId) || null;
    if (!(bar instanceof HTMLElement)) return { ok: false, status: 'bar-missing' };

    const pill = getOrCreatePill(bar, answerId);
    if (!(pill instanceof HTMLElement)) return { ok: false, status: 'pill-missing' };

    const chatId = toChatId(opts.chatId || msgEl?.closest?.('[data-chat-id]')?.getAttribute?.('data-chat-id') || toChatId());
    const mode = getChatMode(chatId);
    const stateRes = ensureTurnState(chatId, answerId, { reason: 'attachTurnUi', mode });
    refreshChatSummaryAndProject(chatId, { reason: 'attach-turn-ui', project: false });
    const visibleCount = getAttachedVisibleTags(chatId, answerId, stateRes?.state || null).length;
    pill.textContent = visibleCount > 0 ? `#${visibleCount}` : '#';
    pill.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.openTrays.has(answerId)) closeTurnUi(answerId);
      else openTurnUi(chatId, answerId, { source: 'pill' });
    };

    return { ok: true, status: 'ok', bar, pill };
  }

  function detachTurnUi(answerIdRaw) {
    const answerId = normalizeId(answerIdRaw);
    if (!answerId) return false;
    closeTurnUi(answerId);
    const titleApi = getTitleApi();
    const bar = titleApi?.getBar?.(answerId) || null;
    const pill = bar?.querySelector?.(`[${ATTR_CGXUI_OWNER}="${SkID}"][${ATTR_CGXUI}="${UI_TAG_PILL}"]`) || null;
    try { pill?.remove?.(); } catch {}
    return true;
  }

  function rescanVisibleTitleBars(reason = 'scan') {
    const titleApi = getTitleApi();
    if (!titleApi || (typeof titleApi.getBar !== 'function' && typeof titleApi.ensureBar !== 'function')) return false;
    const turns = listTurns();
    for (const turn of turns) {
      const answerId = normalizeId(turn?.answerId || '');
      if (!answerId) continue;
      const ensured = titleApi.ensureBar?.(answerId) || null;
      const bar = ensured?.bar || titleApi.getBar?.(answerId) || null;
      if (!(bar instanceof HTMLElement)) continue;
      attachTurnUi(turn.answerEl || turn.node || null, answerId, { reason });
    }
    return true;
  }

  function rebuildChat(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return { ok: false, status: 'missing-chat-id' };
    const turns = listTurns(chatId);
    const map = readTurnCache(chatId);
    map.clear();
    for (const turn of turns) analyzeTurn(chatId, turn, { ...opts, force: true });
    const summary = aggregateChat(chatId, { ...opts, force: true }).summary || null;
    return { ok: true, status: 'ok', chatId, turnCount: turns.length, summary };
  }

  function selfCheck() {
    const owner = core.getOwner?.('tags') || null;
    const service = core.getService?.('tags') || null;
    const storageDiag = getCompactStorageDiagnostics();
    return {
      ok: !!owner && !!service,
      ownerRegistered: !!owner,
      serviceRegistered: !!service,
      routeRegistered: !!core.getRoute?.('tags'),
      hasBrowsingApi: typeof MOD.listAllChatTags === 'function' && typeof MOD.listChatsByTag === 'function',
      hasTagsViewer: typeof MOD.openTagsViewer === 'function',
      hasTagViewer: typeof MOD.openTagViewer === 'function',
      hasRenderTagsIntoList: typeof MOD.renderTagsIntoList === 'function',
      openTrayCount: state.openTrays.size,
      cachedChats: state.chatCache.size,
      cachedTurnMaps: state.turnCache.size,
      storageMode: storageDiag.storageMode,
      v2Ready: storageDiag.v2Ready,
      v1KeyCount: storageDiag.v1KeyCount,
      migratedChatCacheCount: storageDiag.migratedChatCacheCount,
      migratedTagPoolCount: storageDiag.migratedTagPoolCount,
      migratedTurnCacheCount: storageDiag.migratedTurnCacheCount,
      lastCompactStatus: storageDiag.lastCompactStatus,
      cfg: getCfg(),
    };
  }

  function getChatTagCatalog(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return [];
    const manualCatalog = buildStoredManualTagCatalog(chatId);
    if (manualCatalog.length) return manualCatalog;
    const cached = readChatSummary(chatId);
    const summary = (cached?.tagCatalog != null) ? cached : (aggregateChat(chatId, { reason: 'get-chat-tag-catalog' }).summary || null);
    const catalog = Array.isArray(summary?.tagCatalog) ? summary.tagCatalog : [];
    return catalog.filter((tag) => Number(tag?.usageCount || 0) > 0);
  }

  async function listAllChatTags(opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    const currentChatId = toChatId(opts.currentChatId || '');
    if (currentChatId && opts.refreshCurrent !== false) {
      try {
        aggregateChat(currentChatId, { reason: opts.reason || 'tags-browser' });
        projectChatMetadata(currentChatId, { reason: opts.reason || 'tags-browser' });
      } catch {}
    }

    const rows = await Promise.resolve(safeListWorkbenchRows());
    const rowByChatId = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const chatId = String(row?.chatId || '').trim();
      if (chatId && !rowByChatId.has(chatId)) rowByChatId.set(chatId, row);
    });

    const chatIds = new Set(Array.from(rowByChatId.keys()));
    try {
      listStoredChatIds().forEach((chatId) => {
        const id = String(chatId || '').trim();
        if (id) chatIds.add(id);
      });
    } catch {}

    const map = new Map();
    const chatCatalogCache = new Map();
    const excludedKeys = getPriorityLabelTagBlocklist();

    for (const chatId of Array.from(chatIds.values())) {
      const row = rowByChatId.get(chatId) || null;
      const href = row ? nativeHrefForRow(row) : (/^[a-z0-9-]{8,}$/i.test(chatId) ? `/c/${encodeURIComponent(chatId)}` : '');
      const title = normalizeLabel(row?.title || row?.excerpt || chatId || 'Untitled chat').slice(0, 120);
      const updatedAt = String(row?.updatedAt || row?.createdAt || '');
      const tagRowsByKey = new Map();

      const appendTagRows = (entries) => {
        (Array.isArray(entries) ? entries : []).forEach((tag) => {
          const key = normalizeTagKey(tag);
          const label = normalizeLabel(tag?.label || tag?.id || tag || '');
          if (!key || !label || excludedKeys.has(key)) return;
          const existing = tagRowsByKey.get(key) || {
            id: key,
            label,
            color: '',
            usageCount: 0,
            turnRefs: [],
          };
          existing.label = existing.label || label;
          if (!existing.color) existing.color = normalizeHexColor(tag?.color || '');
          existing.usageCount = Math.max(existing.usageCount || 0, Number(tag?.usageCount || 0) || 0, 1);
          if ((!existing.turnRefs || !existing.turnRefs.length) && Array.isArray(tag?.turnRefs) && tag.turnRefs.length) {
            existing.turnRefs = tag.turnRefs.filter((ref) => String(ref?.answerId || ref?.turnKey || '').trim());
          }
          tagRowsByKey.set(key, existing);
        });
      };

      if (!chatCatalogCache.has(chatId)) {
        let liveCatalog = [];
        try { liveCatalog = getChatTagCatalog(chatId) || []; } catch {}
        chatCatalogCache.set(chatId, liveCatalog);
      }
      appendTagRows(chatCatalogCache.get(chatId));

      appendTagRows(Array.isArray(row?.tagCatalog)
        ? row.tagCatalog.filter((tag) => Number(tag?.usageCount || 0) > 0 && String(tag?.label || tag?.id || '').trim())
        : []);
      if (Array.isArray(row?.tags)) {
        appendTagRows(row.tags.map((label) => ({ id: normalizeTagKey(label), label: normalizeLabel(label), color: '', usageCount: 1 })));
      }

      const tagRows = Array.from(tagRowsByKey.values()).filter((tag) => Number(tag?.usageCount || 0) > 0 && String(tag?.label || '').trim());
      const seenInChat = new Set();
      for (const tag of tagRows) {
        const key = normalizeTagKey(tag);
        const label = normalizeLabel(tag?.label || tag?.id || '');
        if (!key || !label || seenInChat.has(key)) continue;
        seenInChat.add(key);
        const current = map.get(key) || {
          id: key,
          label,
          color: normalizeHexColor(tag?.color || '') || '#64748B',
          usageCount: 0,
          chats: [],
        };
        current.label = current.label || label;
        if (!current.color || current.color === '#64748B') current.color = normalizeHexColor(tag?.color || '') || current.color;
        current.usageCount += 1;
        const turnRefs = Array.isArray(tag?.turnRefs)
          ? tag.turnRefs.filter((ref) => String(ref?.answerId || ref?.turnKey || '').trim())
          : [];
        current.chats.push({ href, chatId, title, updatedAt, excerpt: String(row?.excerpt || ''), turnRefs });
        map.set(key, current);
      }
    }

    return Array.from(map.values())
      .filter((tag) => Number(tag?.usageCount || 0) > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || String(a.label || '').localeCompare(String(b.label || '')));
  }

  function getCurrentChatTagCount() {
    const chatId = toChatId();
    if (!chatId) return 0;
    try { return Number((getChatTagCatalog(chatId) || []).length) || 0; } catch { return 0; }
  }

  function ensureTagUsageStyle() {
    if (D.getElementById(TAG_USAGE_STYLE_ID)) return;
    const style = D.createElement('style');
    style.id = TAG_USAGE_STYLE_ID;
    style.textContent = `
      [data-h2o-tags-chat-header]:hover { background:rgba(255,255,255,.04); border-radius:8px; }
      [data-h2o-tags-turn-row]:hover { background:rgba(255,255,255,.04); border-radius:6px; }
      [data-h2o-tags-open-btn]:hover { background:rgba(255,255,255,.12) !important; }
    `;
    D.documentElement.appendChild(style);
    state.clean.nodes.add(style);
  }

  function appendTagUsageChatRow(list, chatEntry, tagRecord) {
    if (!list || !chatEntry) return null;
    const href = String(chatEntry.href || '');
    const chatId = String(chatEntry.chatId || '');
    const title = String(chatEntry.title || chatId || 'Untitled chat');
    const turnRefs = Array.isArray(chatEntry.turnRefs) ? chatEntry.turnRefs : [];
    const hasTurns = turnRefs.length > 0;

    const li = D.createElement('li');
    li.setAttribute('data-h2o-tags-chat-item', '1');
    li.style.cssText = 'border-bottom:1px solid var(--border-default,rgba(255,255,255,.08));list-style:none;';

    const header = D.createElement('div');
    header.setAttribute('data-h2o-tags-chat-header', '1');
    header.style.cssText = 'display:flex;align-items:center;padding:12px 4px;gap:8px;cursor:pointer;border-radius:8px;';

    const body = D.createElement(href ? 'a' : 'div');
    if (href) {
      body.href = href;
      body.style.cssText = 'flex:1 1 auto;min-width:0;text-decoration:none;color:inherit;';
    } else {
      body.style.cssText = 'flex:1 1 auto;min-width:0;';
    }

    const titleEl = D.createElement('div');
    titleEl.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    titleEl.textContent = title;
    body.appendChild(titleEl);

    if (hasTurns) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
      sub.textContent = `${turnRefs.length} tagged ${turnRefs.length === 1 ? 'turn' : 'turns'}`;
      body.appendChild(sub);
    } else if (chatEntry.updatedAt) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
      sub.textContent = chatEntry.updatedAt;
      body.appendChild(sub);
    }

    header.appendChild(body);

    let turnsContainer = null;
    if (hasTurns) {
      const toggle = D.createElement('button');
      toggle.type = 'button';
      toggle.style.cssText = 'all:unset;box-sizing:border-box;flex-shrink:0;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,.6);transition:transform 0.15s;';
      toggle.setAttribute('aria-label', 'Expand turns');
      toggle.innerHTML = SVG_CHEVRON_DOWN;
      header.appendChild(toggle);

      turnsContainer = D.createElement('div');
      turnsContainer.setAttribute('data-h2o-tags-turns', '1');
      turnsContainer.style.cssText = 'display:none;padding:0 4px 8px 4px;';

      turnRefs.forEach((ref, idx) => {
        const turnRow = D.createElement('div');
        turnRow.setAttribute('data-h2o-tags-turn-row', '1');
        turnRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;margin-bottom:2px;border:1px solid rgba(255,255,255,.05);';

        const ordinalEl = D.createElement('span');
        ordinalEl.style.cssText = 'flex-shrink:0;min-width:22px;height:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;font-size:11px;font-weight:600;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);padding:0 4px;';
        ordinalEl.textContent = String(ref.ordinal > 0 ? ref.ordinal : idx + 1);
        turnRow.appendChild(ordinalEl);

        const snippetEl = D.createElement('div');
        snippetEl.style.cssText = 'flex:1 1 auto;min-width:0;font-size:12px;color:rgba(255,255,255,.78);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        snippetEl.textContent = ref.snippet || `Turn ${ref.ordinal || idx + 1}`;
        snippetEl.title = ref.snippet || '';
        turnRow.appendChild(snippetEl);

        const openBtn = D.createElement('button');
        openBtn.type = 'button';
        openBtn.setAttribute('data-h2o-tags-open-btn', '1');
        openBtn.style.cssText = 'all:unset;box-sizing:border-box;flex-shrink:0;height:24px;padding:0 9px;border-radius:8px;font-size:11px;cursor:pointer;background:rgba(255,255,255,.07);color:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.12);white-space:nowrap;';
        openBtn.textContent = 'Open';
        openBtn.title = 'Navigate to this turn';
        openBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = String(ref.answerId || ref.turnKey || '');
          if (target) openTurnByRef(chatId, target);
          else if (href) W.location.href = href;
        };
        turnRow.appendChild(openBtn);
        turnsContainer.appendChild(turnRow);
      });

      let expanded = false;
      const toggleExpand = (e) => {
        if (e?.target?.closest?.('a')) return;
        e?.preventDefault();
        e?.stopPropagation();
        expanded = !expanded;
        turnsContainer.style.display = expanded ? 'block' : 'none';
        toggle.style.transform = expanded ? 'rotate(180deg)' : '';
        toggle.setAttribute('aria-expanded', String(expanded));
      };
      toggle.onclick = toggleExpand;
      header.onclick = toggleExpand;
    } else if (href) {
      header.onclick = () => { W.location.href = href; };
    }

    li.appendChild(header);
    if (turnsContainer) li.appendChild(turnsContainer);
    list.appendChild(li);
    return li;
  }

  async function resolveTagRecord(tagIdOrRecord, opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    if (tagIdOrRecord && typeof tagIdOrRecord === 'object' && Array.isArray(tagIdOrRecord.chats)) {
      return tagIdOrRecord;
    }
    const key = normalizeTagKey(tagIdOrRecord);
    const labelKey = normalizeTagKey(typeof tagIdOrRecord === 'object' ? (tagIdOrRecord.label || tagIdOrRecord.id || '') : tagIdOrRecord);
    const tags = await listAllChatTags(opts);
    const found = tags.find((tag) => normalizeTagKey(tag) === key || normalizeTagKey(tag?.label || '') === labelKey) || null;
    if (found) return found;
    const label = normalizeLabel(typeof tagIdOrRecord === 'object' ? (tagIdOrRecord.label || tagIdOrRecord.id || '') : tagIdOrRecord) || key || 'Tag';
    return {
      id: key || slugify(label),
      label,
      color: '#64748B',
      usageCount: 0,
      chats: [],
    };
  }

  async function listChatsByTag(tagIdOrLabel, opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    const tag = await resolveTagRecord(tagIdOrLabel, opts);
    const chats = Array.isArray(tag?.chats) ? tag.chats.slice() : [];
    return chats.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function openTagUsageViewer(tagRecord, opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    const chats = Array.isArray(tagRecord?.chats) ? tagRecord.chats.slice() : [];
    const tagLabel = String(tagRecord?.label || tagRecord?.id || 'Tag');
    const tagColor = normalizeHexColor(tagRecord?.color || '') || '#64748B';
    chats.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    ensureStyle();
    ensureTagUsageStyle();

    const chatCount = chats.length;
    const subtitle = `${chatCount} ${chatCount === 1 ? 'chat' : 'chats'} using this tag`;

    const shell = makeInShellPageShell(`#${tagLabel}`, subtitle, 'Chats', {
      kind: 'tags-usage',
      id: String(tagRecord?.id || ''),
      iconSvg: SVG_TAG_ICON,
      iconColor: tagColor,
    });
    if (shell?.list) {
      if (!chats.length) {
        const empty = D.createElement('li');
        empty.style.cssText = 'padding:24px 12px;color:rgba(255,255,255,.5);font-size:13px;list-style:none;';
        empty.textContent = 'No chats using this tag yet.';
        shell.list.appendChild(empty);
      } else {
        chats.forEach((chatEntry) => appendTagUsageChatRow(shell.list, chatEntry, tagRecord));
      }
    }
    if (shell?.page && mountInShellPage(shell.page)) {
      return shell.page;
    }

    closeViewer();
    const fallback = makeViewerShell(`#${tagLabel}`, subtitle, { mode: 'panel', iconSvg: SVG_TAG_ICON, iconColor: tagColor });
    if (!fallback?.box || !fallback?.list) return null;
    if (!chats.length) {
      const empty = D.createElement('div');
      empty.style.cssText = 'padding:16px 12px;color:rgba(255,255,255,.5);font-size:13px;';
      empty.textContent = 'No chats using this tag yet.';
      fallback.box.appendChild(empty);
    } else {
      chats.forEach((chatEntry) => appendTagUsageChatRow(fallback.list, chatEntry, tagRecord));
    }
    D.body.appendChild(fallback.box);
    state.viewerEl = fallback.box;
    state.clean.nodes.add(fallback.box);
    return fallback.box;
  }

  async function openTagViewer(tagIdOrRecord, opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    const tag = await resolveTagRecord(tagIdOrRecord, opts);
    return openTagUsageViewer(tag, opts);
  }

  // ─── Phase 5: Tag Bubble Cloud ──────────────────────────────────────────────
  // Replaces the vertical <li> list with a colorful, frequency-sized bubble cloud.
  // Data sources (read-only): listAllChatTags() (existing per-chat tags) + Phase 4
  // getTagAutoPoolSnapshot() (cross-chat candidates). Existing tags carry their
  // openTagViewer wiring (which already navigates to turns via openTurnByRef);
  // candidate-only bubbles open a non-navigating info popup pending Phase 6 NavTo.
  // No mutation of tags:manual:v1 / tag-pool / auto-pool data — purely read-side UI.

  const CLOUD_STYLE_ID = `cgxui-${SkID}-cloud-style`;
  const CLOUD_ATTR = ATTR_CGXUI;
  const CLOUD_OWNER = SkID;
  const CLOUD_BUBBLE_FONT_MIN = 12;
  const CLOUD_BUBBLE_FONT_MAX = 28;

  // Phase 5.5 — Candidate quality filter (DISPLAY-TIME only).
  // Auto-pool data in Store stays untouched; we just hide low-value candidates from the
  // bubble cloud so the user-facing surface looks intelligent. Manual / in-use tags always
  // pass — user-chosen tags are sacred even if they happen to look generic.
  const CANDIDATE_NOISE_WORDS = new Set([
    // Articles, conjunctions, prepositions
    'a','an','the','and','or','but','nor','so','yet','for','as','at','by',
    'in','on','of','to','up','down','out','off','over','under','through',
    'around','across','behind','before','after','during','since','until',
    'between','among','within','without','against','toward','towards',
    'with','from','into','onto','upon','about','above','below','beside',
    // Pronouns
    'i','me','my','mine','myself','you','your','yours','yourself','yourselves',
    'he','him','his','himself','she','her','hers','herself',
    'it','its','itself','we','us','our','ours','ourselves',
    'they','them','their','theirs','themselves',
    'this','that','these','those','here','there','where','when','why','how',
    'what','who','whom','whose','which','whether','if','unless','because',
    'although','though','while','whereas','despite','however','therefore',
    'thus','hence',
    // Auxiliary / modal verbs + contractions
    'am','is','are','was','were','be','been','being','do','does','did','doing',
    'have','has','had','having','will','would','could','should','can','cannot','cant',
    'may','might','must','shall','ought','wont','dont','doesnt','didnt','isnt','arent','wasnt','werent','hasnt','havent','hadnt',
    // Common non-topical verbs (English)
    'go','goes','going','went','gone','get','gets','got','gotten','getting',
    'make','makes','made','making','take','takes','took','taking','taken',
    'come','comes','came','coming','say','says','said','saying',
    'see','sees','saw','seen','seeing','look','looks','looked','looking',
    'know','knows','knew','known','knowing','think','thinks','thought',
    'use','uses','used','using','find','finds','found','finding',
    'give','gives','gave','given','giving','tell','tells','told','telling',
    'work','works','worked','working','call','calls','called','calling',
    'try','tries','tried','trying','ask','asks','asked','asking',
    'need','needs','needed','want','wants','wanted','wanting',
    'put','puts','putting','let','lets','letting','seem','seems','seemed','seeming',
    'become','becomes','became','becoming','feel','feels','felt','feeling',
    'leave','leaves','left','leaving','keep','keeps','kept','keeping',
    'mean','means','meant','meaning','help','helps','helped','helping',
    'show','shows','showed','shown','showing','hear','hears','heard','hearing',
    'run','runs','ran','running','move','moves','moved','moving',
    'believe','believes','believed','believing','hold','holds','held','holding',
    'bring','brings','brought','bringing','happen','happens','happened',
    'write','writes','wrote','written','writing','provide','provides','provided',
    'sit','sits','sat','sitting','stand','stands','stood','standing',
    'lose','loses','lost','losing','pay','pays','paid','paying',
    'meet','meets','met','meeting','include','includes','included','including',
    'continue','continues','continued','set','sets','setting',
    'learn','learns','learned','learnt','learning','change','changes','changed','changing',
    'lead','leads','led','leading','understand','understands','understood','understanding',
    'watch','watches','watched','watching','follow','follows','followed','following',
    'stop','stops','stopped','create','creates','created','creating',
    'speak','speaks','spoke','spoken','speaking','spend','spends','spent','spending',
    'read','reads','reading','allow','allows','allowed','allowing',
    'add','adds','added','adding','open','opens','opened','opening',
    'close','closes','closed','closing','reach','reaches','reached','reaching',
    'build','builds','built','building','remain','remains','remained',
    'suggest','suggests','suggested','remember','remembers','remembered',
    'consider','considers','considered','appear','appears','appeared',
    'wait','waits','waited','waiting','serve','serves','served','serving',
    'send','sends','sent','sending','expect','expects','expected',
    'live','lives','lived','living','play','plays','played','playing',
    // Adverbs / qualifiers
    'also','too','very','quite','rather','really','actually','especially',
    'particularly','generally','usually','often','sometimes','always','never',
    'already','still','yet','just','only','even','almost','enough',
    'much','many','more','most','less','least','several','few',
    'some','any','all','both','each','every','either','neither','none','one',
    'two','first','last','next','same','other','others','another','such','own',
    'right','left','full','half','little','big','small','large','long','short',
    'high','low','new','old','good','better','best','bad','worse','worst',
    'great','greater','greatest','simple','simpler','easy','easier','hard','harder',
    'happy','sad','nice','fine','important','interesting','similar','different',
    'difficult','clear','clearly','quick','quickly','slow','slowly',
    'real','actual','specific','general','common','normal','regular','typical',
    'obvious','obviously','possible','possibly','likely','probably',
    'recent','recently','current','currently','past','present','future',
    // Overly generic nouns
    'thing','things','something','anything','everything','nothing',
    'someone','anyone','everyone','nobody','somebody','anybody','noone',
    'somewhere','anywhere','everywhere','nowhere','way','ways',
    'time','times','day','days','year','years','week','weeks','month','months',
    'hour','hours','minute','minutes','second','seconds','case','cases',
    'point','points','part','parts','side','sides','place','places',
    'kind','sort','number','numbers','example','examples',
    'idea','ideas','question','questions','problem','problems','issue','issues',
    'fact','facts','reason','reasons','result','results','difference','differences',
    'matter','matters','effect','effects','answer','answers',
    // Negation / conversational fragments
    'not','no','never',
    'okay','ok','yes','yeah','nope','sure','maybe','perhaps','please','thanks','thank',
    'hello','hi','hey','goodbye','bye',
    'lol','omg','btw','imo','tbh','idk','etc',
    // German subset (mirrors existing STOPWORDS, expanded)
    'und','oder','aber','nicht','eine','einer','einem','einen','dass','auch','noch','mehr','hier','dort','wenn','dann','wie','was',
    'ich','du','er','sie','wir','ihr','das','der','die','den','dem','des','ein','sein','haben','werden','können','sollen','müssen','wollen','dürfen','mögen','machen','geben','gehen','kommen','sagen','sehen','wissen','denken','glauben','finden','nehmen','lassen',
    'gut','schlecht','groß','klein','viele','viel','jetzt','heute','morgen','gestern','immer','nie','nur','schon','noch','sehr','etwas','nichts','alle','beide',
  ]);

  // Returns { ok, reason } where reason is one of:
  //   'manual'        — bubble is a manual / in-use tag (always passes)
  //   'stopword'      — matches the noise word list above
  //   'numeric'       — starts with a digit (catches '100', '2026', '1best', '20x', '90-month')
  //   'short'         — < 3 chars after trim
  //   'low-alpha'     — < 2 alphabetic chars (mostly punctuation)
  //   'empty'         — defensive: empty label
  //   null / undefined — passes; ranked normally
  function assessCandidateQuality(bubble) {
    if (!bubble) return { ok: false, reason: 'empty' };
    if (bubble.kind === 'manual') return { ok: true, reason: 'manual' };
    const label = String(bubble.label || '').trim().toLowerCase();
    const key   = String(bubble.key   || '').trim().toLowerCase();
    if (!label) return { ok: false, reason: 'empty' };
    if (CANDIDATE_NOISE_WORDS.has(label) || CANDIDATE_NOISE_WORDS.has(key)) {
      return { ok: false, reason: 'stopword' };
    }
    // "Starts with a digit" catches: pure numbers (100, 2026), numeric-noise (1best, 1name),
    // numeric measures (20x, 10x, 90-month). Real product names like 'gpt4', 'iphone15',
    // 'ios17', 'react18', 'macos14' don't start with a digit, so they survive.
    if (/^\d/.test(label)) {
      return { ok: false, reason: 'numeric' };
    }
    if (label.length < 3) {
      return { ok: false, reason: 'short' };
    }
    const alphaCount = (label.match(/[a-z؀-ۿ]/gi) || []).length;
    if (alphaCount < 2) {
      return { ok: false, reason: 'low-alpha' };
    }
    return { ok: true, reason: null };
  }

  function ensureBubbleCloudStyle() {
    if (D.getElementById(CLOUD_STYLE_ID)) return;
    const style = D.createElement('style');
    style.id = CLOUD_STYLE_ID;
    style.textContent = `
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-root"] {
        display: flex; flex-direction: column; gap: 12px;
        padding: 14px 12px; max-width: 100%;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-toolbar"] {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        padding: 8px; border-radius: 12px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        backdrop-filter: blur(10px);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-search"] {
        flex: 1 1 200px; min-width: 160px; box-sizing: border-box;
        height: 30px; padding: 0 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.18);
        color: rgba(255,255,255,.92);
        font-size: 12px; outline: none;
        transition: border-color 200ms cubic-bezier(.2,.8,.2,1);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-search"]:focus {
        border-color: rgba(255,255,255,.32);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-sort"] {
        box-sizing: border-box; height: 30px; padding: 0 8px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.18);
        color: rgba(255,255,255,.92);
        font-size: 12px; cursor: pointer;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-toggle-candidates"] {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 0 10px; height: 30px;
        border-radius: 8px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        color: rgba(255,255,255,.78);
        font-size: 11px; cursor: pointer; user-select: none;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-toggle-candidates"] input { margin: 0; cursor: pointer; }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-refresh"] {
        all: unset; box-sizing: border-box;
        width: 30px; height: 30px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.18);
        color: rgba(255,255,255,.78);
        font-size: 14px; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        transition: background 200ms cubic-bezier(.2,.8,.2,1);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-refresh"]:hover { background: rgba(255,255,255,.08); }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-status"] {
        font-size: 10px; color: rgba(255,255,255,.42);
        padding: 2px 6px; letter-spacing: .02em;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-canvas"] {
        display: flex; flex-wrap: wrap; gap: 6px;
        align-items: center; align-content: flex-start;
        padding: 4px 0; min-height: 60px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-bubble"] {
        all: unset; box-sizing: border-box;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 12px; border-radius: 999px;
        cursor: pointer; line-height: 1.15;
        font-weight: 500; letter-spacing: .01em;
        background: color-mix(in srgb, var(--bubble-color, #64748B) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--bubble-color, #64748B) 38%, transparent);
        color: color-mix(in srgb, var(--bubble-color, #64748B) 70%, white);
        transition: transform 200ms cubic-bezier(.2,.8,.2,1),
                    box-shadow 200ms cubic-bezier(.2,.8,.2,1),
                    background 200ms cubic-bezier(.2,.8,.2,1);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-bubble"]:hover {
        transform: translateY(-1px);
        background: color-mix(in srgb, var(--bubble-color, #64748B) 22%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--bubble-color, #64748B) 35%, transparent),
                    0 8px 22px color-mix(in srgb, var(--bubble-color, #64748B) 22%, transparent);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-bubble"]:active { transform: translateY(0) scale(.97); }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-bubble"][${ATTR_CGXUI_STATE}="candidate"] {
        border-style: dashed;
        background: color-mix(in srgb, var(--bubble-color, #64748B) 8%, transparent);
        color: color-mix(in srgb, var(--bubble-color, #64748B) 60%, rgba(255,255,255,.65));
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="bubble-count"] {
        font-size: 10px; opacity: .7;
        padding: 1px 6px; border-radius: 999px;
        background: rgba(255,255,255,.08);
        font-weight: 600;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-empty"] {
        padding: 28px 16px; text-align: center;
        color: rgba(255,255,255,.55); font-size: 13px;
        border-radius: 12px;
        background: rgba(255,255,255,.02);
        border: 1px dashed rgba(255,255,255,.10);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-loading"] {
        padding: 16px; text-align: center;
        color: rgba(255,255,255,.55); font-size: 12px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] {
        position: fixed; width: 340px;
        max-width: calc(100vw - 16px); max-height: 420px; overflow: auto;
        padding: 12px; border-radius: 14px;
        background: rgba(20,20,20,.98);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 18px 60px rgba(0,0,0,.45);
        backdrop-filter: blur(12px);
        z-index: 2147483647;
        color: rgba(255,255,255,.88); font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-header"] {
        display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
        padding-bottom: 8px; margin-bottom: 8px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] .pop-pill {
        padding: 4px 10px; border-radius: 999px;
        background: color-mix(in srgb, var(--bubble-color, #64748B) 14%, transparent);
        border: 1px dashed color-mix(in srgb, var(--bubble-color, #64748B) 38%, transparent);
        color: color-mix(in srgb, var(--bubble-color, #64748B) 60%, rgba(255,255,255,.7));
        font-weight: 500;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] .pop-meta {
        font-size: 11px; color: rgba(255,255,255,.55);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-row"] {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 4px; border-radius: 6px; gap: 8px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-row"]:hover { background: rgba(255,255,255,.04); }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] .pop-link {
        color: rgba(180,200,255,.85); text-decoration: none;
        font-family: ui-monospace, monospace; font-size: 11px;
        max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] .pop-link:hover { color: rgba(220,230,255,1); text-decoration: underline; }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] .pop-row-count { font-size: 11px; color: rgba(255,255,255,.55); flex-shrink: 0; }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-footer"] {
        margin-top: 10px; padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,.08);
        font-size: 10px; color: rgba(255,255,255,.45);
        text-align: center; font-style: italic;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-empty"] {
        padding: 16px 8px; text-align: center; color: rgba(255,255,255,.45);
      }
      /* Phase 6: expandable chat rows + lazy turn list */
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chats-loading"],
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turns-loading"] {
        padding: 12px 8px; text-align: center; color: rgba(255,255,255,.55); font-size: 11px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turns-error"] {
        padding: 8px; text-align: center; color: rgba(255,150,150,.75); font-size: 11px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turns-empty"] {
        padding: 8px; text-align: center; color: rgba(255,255,255,.45); font-size: 11px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turns-more"] {
        padding: 6px 8px; text-align: center; color: rgba(255,255,255,.45); font-size: 10px; font-style: italic;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-row"] {
        border-radius: 8px; margin-bottom: 2px;
        transition: background 200ms cubic-bezier(.2,.8,.2,1);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-row"]:hover {
        background: rgba(255,255,255,.03);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-header"] {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 6px 6px 4px; border-radius: 6px; cursor: pointer;
        min-height: 28px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-chevron"] {
        all: unset; box-sizing: border-box;
        width: 22px; height: 22px;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 6px; cursor: pointer;
        color: rgba(255,255,255,.55);
        transition: transform 200ms cubic-bezier(.2,.8,.2,1), background 200ms cubic-bezier(.2,.8,.2,1);
        flex-shrink: 0;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-chevron"]:hover {
        background: rgba(255,255,255,.06); color: rgba(255,255,255,.85);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-chevron"] svg { display:block; width:14px; height:14px; }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-title"] {
        flex: 1 1 auto; min-width: 0;
        font-size: 12px; color: rgba(255,255,255,.88); text-decoration: none;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-title"]:hover {
        color: rgba(220,230,255,1); text-decoration: underline;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-here"] {
        flex-shrink: 0; padding: 1px 6px; border-radius: 999px;
        font-size: 9px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
        background: color-mix(in srgb, var(--bubble-color, #64748B) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--bubble-color, #64748B) 38%, transparent);
        color: color-mix(in srgb, var(--bubble-color, #64748B) 70%, white);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-chat-count"] {
        flex-shrink: 0; font-size: 11px; color: rgba(255,255,255,.55);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turns-container"] {
        padding: 4px 8px 8px 28px;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turn-row"] {
        display: flex; align-items: center; gap: 8px;
        padding: 5px 6px; border-radius: 6px;
        margin-bottom: 2px;
        border: 1px solid rgba(255,255,255,.04);
        transition: background 200ms cubic-bezier(.2,.8,.2,1), border-color 200ms cubic-bezier(.2,.8,.2,1);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turn-row"]:hover {
        background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.10);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turn-ordinal"] {
        flex-shrink: 0; min-width: 26px; height: 18px;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 5px; padding: 0 4px;
        font-size: 10px; font-weight: 600;
        background: rgba(255,255,255,.08); color: rgba(255,255,255,.62);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turn-id"] {
        flex: 1 1 auto; min-width: 0;
        font-family: ui-monospace, monospace; font-size: 10px;
        color: rgba(255,255,255,.62);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turn-open"] {
        all: unset; box-sizing: border-box;
        flex-shrink: 0;
        height: 22px; padding: 0 9px;
        border-radius: 6px;
        font-size: 10px; font-weight: 600; letter-spacing: .02em;
        background: rgba(255,255,255,.06); color: rgba(255,255,255,.82);
        border: 1px solid rgba(255,255,255,.10);
        cursor: pointer;
        transition: background 200ms cubic-bezier(.2,.8,.2,1), color 200ms cubic-bezier(.2,.8,.2,1);
      }
      [${ATTR_CGXUI_OWNER}="${CLOUD_OWNER}"][${CLOUD_ATTR}="cloud-candidate-pop"] [${CLOUD_ATTR}="pop-turn-open"]:hover {
        background: color-mix(in srgb, var(--bubble-color, #64748B) 22%, rgba(255,255,255,.08));
        color: rgba(255,255,255,1);
      }
    `;
    D.documentElement.appendChild(style);
    state.clean.nodes.add(style);
  }

  function bubbleEscapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function bubbleStableColorForKey(key) {
    const palette = TAG_COLOR_PALETTE;
    if (!palette || !palette.length) return '#64748B';
    const s = String(key || '');
    if (!s) return palette[0];
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
  }

  function bubbleFontSize(count) {
    const n = Math.max(0, Number(count || 0));
    const raw = CLOUD_BUBBLE_FONT_MIN + 4 * Math.log2(n + 1);
    return Math.max(CLOUD_BUBBLE_FONT_MIN, Math.min(CLOUD_BUBBLE_FONT_MAX, Math.round(raw)));
  }

  function buildBubbleData(existingTags, autoPool, includeCandidates) {
    // Existing tags from listAllChatTags(): { id, label, color, usageCount, chats[] }
    // Auto-pool entries from getTagAutoPoolSnapshot(): { phrase, totalCount, chatCount,
    //   score, status, blocked, contribByChat, lastSeen }
    // Existing wins on key collision; we still augment with auto-pool score/lastSeen so
    // 'recency' / 'score' sorts work uniformly across both flavors.
    const map = new Map();
    (Array.isArray(existingTags) ? existingTags : []).forEach((tag) => {
      const key = String(tag?.id || normalizeTagKey(tag?.label || ''));
      if (!key) return;
      map.set(key, {
        key,
        label: String(tag?.label || tag?.id || key),
        color: tag?.color || '',
        count: Number(tag?.usageCount || 0) || 0,
        score: 0,
        kind: 'manual',
        tagRecord: tag,
        chatRefs: Array.isArray(tag?.chats) ? tag.chats.length : 0,
        blocked: false,
        lastSeen: 0,
        contribByChat: null,
      });
    });
    if (includeCandidates && autoPool && autoPool.phrases) {
      Object.entries(autoPool.phrases).forEach(([key, c]) => {
        if (!key || !c) return;
        if (c.blocked) return;                  // priority-label collision — never surface
        if (c.status === 'rejected') return;    // user-rejected candidate — hide
        const existing = map.get(key);
        if (existing) {
          // Augment manual entry with score/recency so cross-source sorts behave correctly.
          existing.score = Number(c.score || 0) || existing.score;
          existing.lastSeen = Number(c.lastSeen || 0) || existing.lastSeen;
          return;
        }
        map.set(key, {
          key,
          label: String(c.phrase || key),
          color: '',
          count: Number(c.totalCount || 0) || 0,
          score: Number(c.score || 0) || 0,
          kind: 'candidate',
          tagRecord: null,
          chatRefs: Number(c.chatCount || 0) || 0,
          blocked: false,
          lastSeen: Number(c.lastSeen || 0) || 0,
          contribByChat: c.contribByChat || null,
        });
      });
    }
    const all = Array.from(map.values());
    // Phase 5.5: stamp every bubble with quality info. Manual bubbles always pass.
    all.forEach((b) => {
      const assess = assessCandidateQuality(b);
      b.qualityReason = assess.reason || null;
      b.qualityOk = !!assess.ok;
    });
    return all;
  }

  // Diagnostic surface for the candidate quality filter. Returns the same kind of breakdown
  // shown in the toolbar status, plus a small sample of hidden labels so consumers can
  // tune the filter or expose an "audit" view later.
  async function getTagBubbleCloudDiagnostics(opts = {}) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    let tags = [];
    try { tags = await Promise.resolve(listAllChatTags(o)); }
    catch (e) { err('cloud-diag:list-all-chat-tags', e); }
    let auto = null;
    try { auto = getTagAutoPoolSnapshot(); }
    catch (e) { err('cloud-diag:auto-pool-snapshot', e); }
    const merged = buildBubbleData(Array.isArray(tags) ? tags : [], auto, true);
    const totalManual    = merged.filter((b) => b.kind === 'manual').length;
    const totalCandidate = merged.filter((b) => b.kind === 'candidate').length;
    const visibleManual    = merged.filter((b) => b.kind === 'manual' && b.qualityOk).length;
    const visibleCandidate = merged.filter((b) => b.kind === 'candidate' && b.qualityOk).length;
    const hidden           = merged.filter((b) => !b.qualityOk);
    const hiddenByReason   = hidden.reduce((acc, b) => {
      const r = b.qualityReason || 'unknown';
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const sampleSize = Number.isFinite(Number(o.sampleSize)) ? Math.max(0, Math.min(50, Math.floor(Number(o.sampleSize)))) : 12;
    return {
      totalManual,
      totalCandidates: totalCandidate,
      visibleManual,
      visibleCandidates: visibleCandidate,
      visibleTotal: visibleManual + visibleCandidate,
      hiddenTotal: hidden.length,
      hiddenByReason,
      sampleHidden: hidden.slice(0, sampleSize).map((b) => ({
        label: b.label, key: b.key, count: b.count, reason: b.qualityReason, kind: b.kind,
      })),
      noiseWordCount: CANDIDATE_NOISE_WORDS.size,
    };
  }

  function filterBubbleData(bubbles, query) {
    if (!query) return bubbles;
    const q = String(query).toLowerCase();
    return bubbles.filter((b) => String(b.label || '').toLowerCase().includes(q) || String(b.key || '').toLowerCase().includes(q));
  }

  function sortBubbleData(bubbles, mode) {
    const out = bubbles.slice();
    if (mode === 'alpha') {
      out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    } else if (mode === 'recency') {
      out.sort((a, b) => (Number(b.lastSeen || 0) - Number(a.lastSeen || 0)) || (Number(b.count || 0) - Number(a.count || 0)));
    } else if (mode === 'score') {
      out.sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)) || (Number(b.count || 0) - Number(a.count || 0)));
    } else {
      // 'count' — default
      out.sort((a, b) => (Number(b.count || 0) - Number(a.count || 0)) || String(a.label).localeCompare(String(b.label)));
    }
    return out;
  }

  function buildBubbleTooltip(bubble) {
    const parts = [bubble.label];
    parts.push(`${bubble.count} ${bubble.count === 1 ? 'chat' : 'chats'}`);
    if (bubble.kind === 'candidate') parts.push('candidate (auto)');
    else parts.push('in use');
    if (bubble.score) parts.push(`score ${bubble.score.toFixed(1)}`);
    if (bubble.lastSeen) {
      try { parts.push(`last seen ${new Date(bubble.lastSeen).toLocaleDateString()}`); }
      catch (_e) {}
    }
    return parts.join(' · ');
  }

  function closeCloudCandidatePopup() {
    const pop = state.cloudCandidatePopup;
    if (pop && pop.isConnected) {
      try { pop.remove(); } catch (_e) {}
    }
    state.cloudCandidatePopup = null;
    if (state.cloudCandidatePopupDismiss) {
      try { D.removeEventListener('click', state.cloudCandidatePopupDismiss, true); } catch (_e) {}
      state.cloudCandidatePopupDismiss = null;
    }
  }

  // Phase 6: lazily-loaded chat-title cache shared by all candidate popups in this session.
  // First popup pays for the workbench-row fetch; subsequent popups read from the cache.
  // Reload the page to pick up new chat titles.
  async function getCloudChatTitleCache() {
    if (state.cloudChatTitleCache instanceof Map) return state.cloudChatTitleCache;
    const map = new Map();
    try {
      const rows = await Promise.resolve(safeListWorkbenchRows());
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const id = String(r?.chatId || '').trim();
        if (!id) return;
        const title = normalizeLabel(r?.title || r?.excerpt || id).slice(0, 80);
        map.set(id, title);
      });
    } catch (e) { err('cloud:title-cache', e); }
    state.cloudChatTitleCache = map;
    return map;
  }

  function renderCandidateTurnList(container, chatId, bubble, turnIds, isCurrentChat) {
    container.innerHTML = '';
    const ids = Array.isArray(turnIds) ? turnIds : [];
    if (!ids.length) {
      const empty = D.createElement('div');
      empty.setAttribute(CLOUD_ATTR, 'pop-turns-empty');
      empty.textContent = 'No turn references in occurrence index.';
      container.appendChild(empty);
      return;
    }
    const MAX = 20;
    const visible = ids.slice(0, MAX);
    visible.forEach((turnId, idx) => {
      const turnRow = D.createElement('div');
      turnRow.setAttribute(CLOUD_ATTR, 'pop-turn-row');

      const ordinal = D.createElement('span');
      ordinal.setAttribute(CLOUD_ATTR, 'pop-turn-ordinal');
      ordinal.textContent = `T${idx + 1}`;
      turnRow.appendChild(ordinal);

      const idEl = D.createElement('span');
      idEl.setAttribute(CLOUD_ATTR, 'pop-turn-id');
      const tStr = String(turnId || '');
      idEl.textContent = tStr.length > 22 ? `${tStr.slice(0, 12)}…${tStr.slice(-6)}` : tStr;
      idEl.title = tStr;
      turnRow.appendChild(idEl);

      const openBtn = D.createElement('button');
      openBtn.type = 'button';
      openBtn.setAttribute(CLOUD_ATTR, 'pop-turn-open');
      // Same-chat → existing openTurnByRef helper (reused, not new NavTo).
      // Cross-chat → plain link navigation; deferred scroll-to-turn is Phase 7.
      openBtn.textContent = isCurrentChat ? 'Scroll' : 'Open';
      openBtn.title = isCurrentChat
        ? 'Scroll to this turn in the current chat'
        : 'Open this chat (Phase 7 will deep-link to the turn)';
      openBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isCurrentChat) {
          try { openTurnByRef(chatId, tStr); }
          catch (e2) { err('cloud:open-turn-by-ref', e2); }
        } else {
          try { W.location.href = `/c/${encodeURIComponent(chatId)}`; }
          catch (e2) { err('cloud:cross-chat-nav', e2); }
        }
      };
      turnRow.appendChild(openBtn);
      container.appendChild(turnRow);
    });
    if (ids.length > MAX) {
      const more = D.createElement('div');
      more.setAttribute(CLOUD_ATTR, 'pop-turns-more');
      more.textContent = `+${ids.length - MAX} more turn${ids.length - MAX === 1 ? '' : 's'}`;
      container.appendChild(more);
    }
  }

  function openCloudCandidatePopup(anchorEl, bubble) {
    closeCloudCandidatePopup();
    if (!anchorEl || !bubble) return;

    const pop = D.createElement('div');
    pop.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    pop.setAttribute(CLOUD_ATTR, 'cloud-candidate-pop');
    pop.style.setProperty('--bubble-color', bubbleStableColorForKey(bubble.key));

    const header = D.createElement('div');
    header.setAttribute(CLOUD_ATTR, 'pop-header');
    header.innerHTML =
      `<span class="pop-pill">${bubbleEscapeHtml(bubble.label)}</span>` +
      `<span class="pop-meta">${bubble.count} ${bubble.count === 1 ? 'chat' : 'chats'} · candidate · score ${bubble.score ? bubble.score.toFixed(1) : '—'}</span>`;
    pop.appendChild(header);

    const list = D.createElement('div');
    list.setAttribute(CLOUD_ATTR, 'pop-chats');
    pop.appendChild(list);

    const footer = D.createElement('div');
    footer.setAttribute(CLOUD_ATTR, 'pop-footer');
    footer.textContent = 'Same-chat → scrolls. Cross-chat → opens (Phase 7 will deep-link).';
    pop.appendChild(footer);

    // Position adjacent to the bubble; clamp inside viewport.
    const rect = anchorEl.getBoundingClientRect();
    const top = Math.max(8, Math.min(W.innerHeight - 440, rect.bottom + 6));
    const left = Math.max(8, Math.min(W.innerWidth - 360, rect.left));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    D.body.appendChild(pop);
    state.cloudCandidatePopup = pop;
    state.clean.nodes.add(pop);

    const dismiss = (e) => {
      if (pop.contains(e.target) || anchorEl.contains(e.target)) return;
      closeCloudCandidatePopup();
    };
    state.cloudCandidatePopupDismiss = dismiss;
    setTimeout(() => {
      try { D.addEventListener('click', dismiss, true); } catch (_e) {}
    }, 10);

    // ─── Async chat-list build ─────────────────────────────────────────────
    // Renders a loading placeholder synchronously, then resolves chat titles + sorts +
    // builds expandable rows. Each row lazily fetches its occurrence index on expand.
    list.innerHTML = '<div data-cgxui="pop-chats-loading">Loading chats…</div>';

    const contribs = Object.entries(bubble.contribByChat || {})
      .map(([chatId, c]) => ({
        chatId,
        count: Number(c?.count || 0) || 0,
        lastSeen: Number(c?.lastSeen || 0) || 0,
      }))
      .filter((r) => r.chatId)
      .sort((a, b) => (b.count - a.count) || (b.lastSeen - a.lastSeen))
      .slice(0, 12);

    if (!contribs.length) {
      list.innerHTML = '';
      const empty = D.createElement('div');
      empty.setAttribute(CLOUD_ATTR, 'pop-empty');
      empty.textContent = 'No chat data — try refreshing the auto-pool.';
      list.appendChild(empty);
      return;
    }

    (async () => {
      const titleMap = await getCloudChatTitleCache();
      // Same-chat detection uses the existing parseChatIdFromHref helper.
      const here = String(parseChatIdFromHref(W.location?.pathname || '') || '').trim();

      // If popup was dismissed during the await, bail out cleanly.
      if (!pop.isConnected) return;

      list.innerHTML = '';

      contribs.forEach(({ chatId, count }) => {
        const row = D.createElement('div');
        row.setAttribute(CLOUD_ATTR, 'pop-chat-row');

        const headerRow = D.createElement('div');
        headerRow.setAttribute(CLOUD_ATTR, 'pop-chat-header');

        const chevron = D.createElement('button');
        chevron.type = 'button';
        chevron.setAttribute(CLOUD_ATTR, 'pop-chat-chevron');
        chevron.setAttribute('aria-label', 'Expand turns');
        chevron.setAttribute('aria-expanded', 'false');
        chevron.innerHTML = SVG_CHEVRON_DOWN;
        headerRow.appendChild(chevron);

        const titleEl = D.createElement('a');
        titleEl.href = `/c/${encodeURIComponent(chatId)}`;
        titleEl.target = '_self';
        titleEl.setAttribute(CLOUD_ATTR, 'pop-chat-title');
        const title = titleMap.get(chatId) || chatId;
        titleEl.textContent = title;
        titleEl.title = `${title}\n${chatId}${chatId === here ? '\n(current chat)' : ''}`;
        headerRow.appendChild(titleEl);

        if (chatId === here) {
          const here_badge = D.createElement('span');
          here_badge.setAttribute(CLOUD_ATTR, 'pop-chat-here');
          here_badge.textContent = 'here';
          headerRow.appendChild(here_badge);
        }

        const counter = D.createElement('span');
        counter.setAttribute(CLOUD_ATTR, 'pop-chat-count');
        counter.textContent = `${count} ${count === 1 ? 'hit' : 'hits'}`;
        headerRow.appendChild(counter);

        row.appendChild(headerRow);

        const turnsContainer = D.createElement('div');
        turnsContainer.setAttribute(CLOUD_ATTR, 'pop-turns-container');
        turnsContainer.style.display = 'none';
        row.appendChild(turnsContainer);

        let expanded = false;
        let loaded = false;
        const toggleExpand = async (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          expanded = !expanded;
          turnsContainer.style.display = expanded ? 'block' : 'none';
          chevron.style.transform = expanded ? 'rotate(180deg)' : '';
          chevron.setAttribute('aria-expanded', String(expanded));
          if (expanded && !loaded) {
            loaded = true;
            turnsContainer.innerHTML = '<div data-cgxui="pop-turns-loading">Loading turns…</div>';
            try {
              const occ = await getOccurrenceIndexForChat(chatId);
              if (!pop.isConnected) return;
              const turnIds = occ?.phrases?.[bubble.key]?.turnIds || [];
              renderCandidateTurnList(turnsContainer, chatId, bubble, turnIds, chatId === here);
            } catch (e2) {
              err('cloud:occ-fetch', e2);
              if (!pop.isConnected) return;
              turnsContainer.innerHTML = '';
              const errEl = D.createElement('div');
              errEl.setAttribute(CLOUD_ATTR, 'pop-turns-error');
              errEl.textContent = 'Could not load turns.';
              turnsContainer.appendChild(errEl);
            }
          }
        };

        chevron.onclick = (e) => toggleExpand(e);
        // Clicking the row (not the title link, not the chevron itself) also toggles.
        headerRow.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;        // don't hijack the title link
          if (e.target.closest('button')) return;   // chevron handles itself
          toggleExpand(e);
        });

        list.appendChild(row);
      });
    })().catch((e) => err('cloud:popup-async', e));
  }

  function renderTagsIntoList(listEl, opts = {}) {
    if (!listEl) return;
    const cfg = (typeof opts === 'function') ? { refreshFn: opts } : ((opts && typeof opts === 'object') ? opts : {});
    const refreshFn = cfg.refreshFn || cfg.refresh || cfg.onRefresh || null;

    ensureBubbleCloudStyle();
    closeCloudCandidatePopup();

    // Wipe the host container and reset list-like styling so the cloud sits cleanly inside.
    listEl.innerHTML = '';
    try { listEl.style.padding = '0'; listEl.style.margin = '0'; listEl.style.listStyle = 'none'; } catch (_e) {}

    // ─── Build DOM scaffold ───
    const root = D.createElement('div');
    root.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    root.setAttribute(CLOUD_ATTR, 'cloud-root');

    const toolbar = D.createElement('div');
    toolbar.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    toolbar.setAttribute(CLOUD_ATTR, 'cloud-toolbar');

    const search = D.createElement('input');
    search.type = 'search';
    search.placeholder = 'Filter tags…';
    search.spellcheck = false;
    search.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    search.setAttribute(CLOUD_ATTR, 'cloud-search');
    search.setAttribute('aria-label', 'Filter tags');

    const sortSel = D.createElement('select');
    sortSel.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    sortSel.setAttribute(CLOUD_ATTR, 'cloud-sort');
    sortSel.setAttribute('aria-label', 'Sort tags');
    [
      ['count',   'Most used'],
      ['alpha',   'A → Z'],
      ['recency', 'Recent'],
      ['score',   'Top score'],
    ].forEach(([value, label]) => {
      const o = D.createElement('option');
      o.value = value; o.textContent = label;
      sortSel.appendChild(o);
    });

    const toggleLabel = D.createElement('label');
    toggleLabel.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    toggleLabel.setAttribute(CLOUD_ATTR, 'cloud-toggle-candidates');
    toggleLabel.title = 'Show auto-pool candidate phrases (Phase 4)';
    const toggleCb = D.createElement('input');
    toggleCb.type = 'checkbox';
    toggleCb.checked = true;
    toggleLabel.appendChild(toggleCb);
    toggleLabel.appendChild(D.createTextNode(' Suggestions'));

    const refreshBtn = D.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    refreshBtn.setAttribute(CLOUD_ATTR, 'cloud-refresh');
    refreshBtn.title = 'Refresh tag list';
    refreshBtn.setAttribute('aria-label', 'Refresh tag list');
    refreshBtn.textContent = '⟳';

    const statusEl = D.createElement('div');
    statusEl.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    statusEl.setAttribute(CLOUD_ATTR, 'cloud-status');

    toolbar.appendChild(search);
    toolbar.appendChild(sortSel);
    toolbar.appendChild(toggleLabel);
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(statusEl);

    const loading = D.createElement('div');
    loading.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    loading.setAttribute(CLOUD_ATTR, 'cloud-loading');
    loading.textContent = 'Loading tags…';

    const canvas = D.createElement('div');
    canvas.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    canvas.setAttribute(CLOUD_ATTR, 'cloud-canvas');
    canvas.setAttribute('role', 'listbox');

    const emptyEl = D.createElement('div');
    emptyEl.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
    emptyEl.setAttribute(CLOUD_ATTR, 'cloud-empty');
    emptyEl.style.display = 'none';

    root.appendChild(toolbar);
    root.appendChild(loading);
    root.appendChild(canvas);
    root.appendChild(emptyEl);
    listEl.appendChild(root);

    const nonce = String(Date.now() + Math.random());
    listEl.dataset.h2oTagsNonce = nonce;

    // Per-mount state (closure). Persisted across re-renders within one mount only.
    const localState = {
      query: '',
      sortMode: 'count',
      showCandidates: true,
      data: { existing: [], autoPool: null },
    };

    const renderBubbles = () => {
      if (!listEl.isConnected || listEl.dataset.h2oTagsNonce !== nonce) return;
      const merged = buildBubbleData(localState.data.existing, localState.data.autoPool, localState.showCandidates);
      // Phase 5.5: hide low-quality candidate bubbles from the cloud (manual tags always pass).
      // Hidden counts are tracked and surfaced in the status line so the filter is observable.
      const visibleBubbles = merged.filter((b) => b.qualityOk);
      const hiddenByReason = merged.reduce((acc, b) => {
        if (!b.qualityOk) acc[b.qualityReason || 'unknown'] = (acc[b.qualityReason || 'unknown'] || 0) + 1;
        return acc;
      }, {});
      const filtered = filterBubbleData(visibleBubbles, localState.query);
      const sorted = sortBubbleData(filtered, localState.sortMode);

      const totalManual = merged.filter((b) => b.kind === 'manual').length;
      const totalCandidate = merged.filter((b) => b.kind === 'candidate').length;
      const totalHidden = Object.values(hiddenByReason).reduce((a, n) => a + n, 0);
      const visibleCandidates = merged.filter((b) => b.kind === 'candidate' && b.qualityOk).length;
      const breakdownParts = Object.entries(hiddenByReason).map(([r, n]) => `${n} ${r}`);
      // Tooltip on the status text shows the per-reason breakdown so the user can see what
      // was filtered without us needing a popup.
      try {
        statusEl.title = totalHidden
          ? `Hidden (display-time noise filter): ${breakdownParts.join(', ')}\nManual / in-use tags always pass.`
          : 'No candidates filtered';
      } catch (_e) {}
      statusEl.textContent = localState.showCandidates
        ? `${sorted.length} shown · ${totalManual} in use · ${visibleCandidates}/${totalCandidate} candidates${totalHidden ? ` · ${totalHidden} hidden as noise` : ''}`
        : `${sorted.length} shown · ${totalManual} in use`;

      canvas.innerHTML = '';
      if (!sorted.length) {
        emptyEl.style.display = 'block';
        emptyEl.textContent = localState.query
          ? `No tags match “${localState.query}”`
          : (totalManual + totalCandidate === 0
              ? 'No tags yet — open chats with the tag tray to discover them, or run a tag scan.'
              : 'No tags match the current filters.');
        return;
      }
      emptyEl.style.display = 'none';

      // RAF-batch render for smoother interaction with very large pools (>150 bubbles).
      const frag = D.createDocumentFragment();
      sorted.forEach((bubble) => {
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
        btn.setAttribute(CLOUD_ATTR, 'cloud-bubble');
        btn.setAttribute(ATTR_CGXUI_STATE, bubble.kind);
        btn.setAttribute('role', 'option');
        const color = bubble.color && /^#[0-9a-f]{6}$/i.test(bubble.color)
          ? bubble.color
          : bubbleStableColorForKey(bubble.key);
        btn.style.setProperty('--bubble-color', color);
        btn.style.fontSize = `${bubbleFontSize(bubble.count)}px`;
        btn.title = buildBubbleTooltip(bubble);

        const labelEl = D.createElement('span');
        labelEl.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
        labelEl.setAttribute(CLOUD_ATTR, 'bubble-label');
        labelEl.textContent = bubble.label;
        btn.appendChild(labelEl);

        const countEl = D.createElement('span');
        countEl.setAttribute(ATTR_CGXUI_OWNER, CLOUD_OWNER);
        countEl.setAttribute(CLOUD_ATTR, 'bubble-count');
        countEl.textContent = String(bubble.count);
        btn.appendChild(countEl);

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (bubble.kind === 'manual' && bubble.tagRecord) {
            // Reuse the existing tag viewer (already wires per-chat list + turn navigation
            // via openTurnByRef). No new NavTo behavior introduced here.
            openTagViewer(bubble.tagRecord, { ...cfg, refreshFn }).catch((error) => err('open-tag-viewer', error));
          } else {
            // Phase 5 candidate path: non-navigating info popup. Phase 6 NavTo will
            // upgrade this to expandable per-chat turn lists.
            openCloudCandidatePopup(btn, bubble);
          }
        };

        frag.appendChild(btn);
      });
      // Single DOM write keeps layout thrash to one paint.
      canvas.appendChild(frag);
    };

    // ─── Toolbar wiring ───
    let searchTimer = 0;
    search.addEventListener('input', () => {
      localState.query = String(search.value || '').trim();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = W.setTimeout(() => { searchTimer = 0; renderBubbles(); }, 80);
    });
    sortSel.addEventListener('change', () => {
      localState.sortMode = sortSel.value;
      renderBubbles();
    });
    toggleCb.addEventListener('change', () => {
      localState.showCandidates = !!toggleCb.checked;
      renderBubbles();
    });
    refreshBtn.addEventListener('click', () => loadData());

    // ─── Data load (re-runnable via refresh button) ───
    const loadData = () => {
      loading.style.display = 'block';
      canvas.innerHTML = '';
      emptyEl.style.display = 'none';
      Promise.resolve(listAllChatTags(cfg)).then((tags) => {
        if (!listEl.isConnected || listEl.dataset.h2oTagsNonce !== nonce) return;
        localState.data.existing = Array.isArray(tags) ? tags : [];
        try { localState.data.autoPool = getTagAutoPoolSnapshot(); }
        catch (e) { err('cloud:auto-pool-snapshot', e); localState.data.autoPool = null; }
        loading.style.display = 'none';
        renderBubbles();
      }).catch((e) => {
        err('render-tags-cloud', e);
        if (!listEl.isConnected || listEl.dataset.h2oTagsNonce !== nonce) return;
        loading.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.textContent = 'Could not load tags';
      });
    };

    loadData();
  }

  function openTagsViewer(opts = {}) {
    opts = (opts && typeof opts === 'object') ? opts : {};
    ensureStyle();
    ensureTagUsageStyle();

    const shell = makeInShellPageShell('Tags', 'Tag usage across chats', 'Tags', {
      kind: 'tags',
      id: '',
      iconSvg: SVG_TAG_ICON,
      iconColor: '#64748B',
    });
    if (shell?.list) renderTagsIntoList(shell.list, opts);
    if (shell?.page && mountInShellPage(shell.page)) {
      return shell.page;
    }

    closeViewer();
    const fallback = makeViewerShell('Tags', 'Tag usage across chats', { mode: 'panel', iconSvg: SVG_TAG_ICON, iconColor: '#64748B' });
    if (!fallback?.box || !fallback?.list) return null;
    renderTagsIntoList(fallback.list, opts);
    D.body.appendChild(fallback.box);
    state.viewerEl = fallback.box;
    state.clean.nodes.add(fallback.box);
    return fallback.box;
  }

  function closeTagViewer() {
    closeTagEditorPopup();
    closeTagPoolPopup();
    closeViewer();
    return true;
  }

  function openTagEditorPopup(anchorEl, opts = {}, chatIdRaw = '', afterChangeRaw = null) {
    const cfg = (opts && typeof opts === 'object') ? opts : { tagRecord: opts };
    const tagRecord = cfg.tagRecord || cfg.tag || cfg.record || ((cfg.id || cfg.label) ? cfg : null);
    const chatId = toChatId(cfg.chatId || chatIdRaw || '');
    const afterChange = typeof cfg.afterChange === 'function'
      ? cfg.afterChange
      : (typeof cfg.onChange === 'function' ? cfg.onChange : afterChangeRaw);
    return openTagEditPopup(anchorEl, tagRecord, chatId, afterChange, cfg) || null;
  }

  function closeTagEditorPopup() {
    closeTagEditPopup();
    return true;
  }

  const owner = {
    phase: 'phase-3-tags-browsing-owner',
    getTurnState(chatId, turnIdOrAnswerId) { return getTurnState(chatId, turnIdOrAnswerId); },
    ensureTurnState(chatId, turnIdOrAnswerId, opts = {}) { return ensureTurnState(chatId, turnIdOrAnswerId, opts); },
    analyzeTurn(chatId, turnIdOrAnswerId, opts = {}) { return analyzeTurn(chatId, turnIdOrAnswerId, opts); },
    analyzeChat(chatId, opts = {}) { return aggregateChat(chatId, opts); },
    getChatSummary(chatId) { return getChatSummary(chatId); },
    getChatTagCatalog(chatId) { return getChatTagCatalog(chatId); },
    listStoredChatIds() { return listStoredChatIds(); },
    listTagPool(chatId) { return listTagPool(chatId); },
    setTagColor(chatId, tagId, color) { return setTagColor(chatId, tagId, color); },
    renameTag(chatId, tagId, nextLabel) { return renameTagInPool(chatId, tagId, nextLabel); },
    getChatMode(chatId) { return getChatMode(chatId); },
    setChatMode(chatId, mode) { const applied = writeChatMode(chatId, mode); refreshChatSummaryAndProject(chatId, { reason: 'set-chat-mode', project: false }); safeDispatch(EV_TAGS_CHANGED, { chatId: toChatId(chatId), mode: applied, source: 'mode-change', ts: Date.now() }); return applied; },
    readChatMode(chatId) { return readChatMode(chatId); },
    writeChatMode(chatId, mode) { return writeChatMode(chatId, mode); },
    getTurnSuggestions(chatId, turnKey) { return getTurnSuggestions(chatId, turnKey); },
    acceptSuggestion(chatId, turnIdOrAnswerId, suggestionIdOrLabel) { return acceptSuggestion(chatId, turnIdOrAnswerId, suggestionIdOrLabel); },
    dismissSuggestion(chatId, turnIdOrAnswerId, suggestionIdOrLabel) { return dismissSuggestion(chatId, turnIdOrAnswerId, suggestionIdOrLabel); },
    addPoolTagToTurn(chatId, turnIdOrAnswerId, tagId) { return addPoolTagToTurn(chatId, turnIdOrAnswerId, tagId); },
    createAndAddTagToTurn(chatId, turnIdOrAnswerId, label) { return createAndAddTagToTurn(chatId, turnIdOrAnswerId, label); },
    removeTurnTag(chatId, turnIdOrAnswerId, tagId) { return removeTurnTag(chatId, turnIdOrAnswerId, tagId); },
    openTagPoolPopup(anchorEl, chatId, turnIdOrAnswerId) { return openTagPoolPopup(anchorEl, chatId, turnIdOrAnswerId); },
    setManualTags(chatId, turnIdOrAnswerId, tags) { return setManualTags(chatId, turnIdOrAnswerId, tags); },
    addManualTag(chatId, turnIdOrAnswerId, tag) { return addManualTag(chatId, turnIdOrAnswerId, tag); },
    removeManualTag(chatId, turnIdOrAnswerId, tagIdOrLabel) { return removeManualTag(chatId, turnIdOrAnswerId, tagIdOrLabel); },
    pinTag(chatId, turnIdOrAnswerId, tagIdOrLabel) { return pinTag(chatId, turnIdOrAnswerId, tagIdOrLabel); },
    hideTag(chatId, turnIdOrAnswerId, tagIdOrLabel) { return hideTag(chatId, turnIdOrAnswerId, tagIdOrLabel); },
    rebuildChat(chatId, opts = {}) { return rebuildChat(chatId, opts); },
    projectChatMetadata(chatId, opts = {}) { return projectChatMetadata(chatId, opts); },
    attachTurnUi(msgEl, answerId, opts = {}) { return attachTurnUi(msgEl, answerId, opts); },
    detachTurnUi(answerId) { return detachTurnUi(answerId); },
    selfCheck() { return selfCheck(); },
    getTagUsageIndex(chatId) { return getTagUsageIndex(chatId); },
    getTagUsageRefs(chatId, tagIdOrLabel) { return getTagUsageRefs(chatId, tagIdOrLabel); },
    listAllChatTags(opts = {}) { return listAllChatTags(opts); },
    listChatsByTag(tagIdOrLabel, opts = {}) { return listChatsByTag(tagIdOrLabel, opts); },
    openTagsViewer(opts = {}) { return openTagsViewer(opts); },
    openTagViewer(tagIdOrRecord, opts = {}) { return openTagViewer(tagIdOrRecord, opts); },
    closeTagViewer() { return closeTagViewer(); },
    renderTagsIntoList(container, opts = {}) { return renderTagsIntoList(container, opts); },
    openTagEditorPopup(anchorEl, opts = {}, chatId = '', afterChange = null) { return openTagEditorPopup(anchorEl, opts, chatId, afterChange); },
    closeTagEditorPopup() { return closeTagEditorPopup(); },
    getCurrentChatTagCount() { return getCurrentChatTagCount(); },
    openTurnByRef(chatId, answerIdOrKey, opts = {}) { return openTurnByRef(chatId, answerIdOrKey, opts); },
    scrollToAnswerInDom(answerId, opts = {}) { return scrollToAnswerInDom(answerId, opts); },
    compactStorage(opts = {}) { return compactStorage(opts); },
    cleanupMigratedV1Storage(opts = {}) { return cleanupMigratedV1Storage(opts); },

    // ─── Phase 4: Tag candidate pool + occurrence index (read-side API) ───────
    // Side-outputs of aggregateChat. Stored via H2O.Library.Store. No UI consumes these
    // yet — Phase 5+ (Bubble Cloud, NavTo) will read them.
    getTagAutoPool() { return getTagAutoPoolSnapshot(); },
    getTagAutoPoolDiagnostics() { return getTagAutoPoolDiagnostics(); },
    async refreshTagAutoPool(chatId, opts = {}) { return refreshTagAutoPoolForChat(chatId, opts); },
    async getOccurrenceIndex(chatId) { return getOccurrenceIndexForChat(chatId); },
    async findTagOccurrences(phrase, opts = {}) { return findTagOccurrences(phrase, opts); },

    // Phase 5.5: candidate-quality diagnostics. Display-time filter only — Store data
    // is never mutated by the cloud.
    async getTagBubbleCloudDiagnostics(opts = {}) { return getTagBubbleCloudDiagnostics(opts); },
  };

  MOD.owner = owner;
  MOD.storage = MOD.storage || {};
  MOD.storage.readTurnCache = readTurnCache;
  MOD.storage.writeTurnCache = writeTurnCache;
  MOD.storage.readChatSummary = readChatSummary;
  MOD.storage.writeChatSummary = writeChatSummary;
  MOD.storage.readManualStore = readManualStore;
  MOD.storage.writeManualStore = writeManualStore;
  MOD.storage.compactStorage = compactStorage;
  MOD.storage.cleanupMigratedV1Storage = cleanupMigratedV1Storage;

  MOD.extract = MOD.extract || {};
  MOD.extract.extractKeywordsFromText = extractKeywordsFromText;
  MOD.extract.selectVisibleTagsFromKeywords = selectVisibleTagsFromKeywords;

  MOD.ui = MOD.ui || {};
  MOD.ui.attachTurnUi = attachTurnUi;
  MOD.ui.detachTurnUi = detachTurnUi;
  MOD.ui.openTurnUi = openTurnUi;
  MOD.ui.closeTurnUi = closeTurnUi;
  MOD.ui.ensureStyle = ensureStyle;
  MOD.ui.openTagPoolPopup = openTagPoolPopup;
  MOD.ui.closeTagPoolPopup = closeTagPoolPopup;
  MOD.ui.openTagEditPopup = openTagEditPopup;
  MOD.ui.closeTagEditPopup = closeTagEditPopup;
  MOD.ui.openTagEditorPopup = openTagEditorPopup;
  MOD.ui.closeTagEditorPopup = closeTagEditorPopup;
  MOD.ui.openTagsViewer = openTagsViewer;
  MOD.ui.openTagViewer = openTagViewer;
  MOD.ui.closeTagViewer = closeTagViewer;
  MOD.ui.renderTagsIntoList = renderTagsIntoList;

  MOD.getTurnState = (...args) => owner.getTurnState(...args);
  MOD.ensureTurnState = (...args) => owner.ensureTurnState(...args);
  MOD.analyzeTurn = (...args) => owner.analyzeTurn(...args);
  MOD.analyzeChat = (...args) => owner.analyzeChat(...args);
  MOD.getChatSummary = (...args) => owner.getChatSummary(...args);
  MOD.getChatTagCatalog = (...args) => owner.getChatTagCatalog(...args);
  MOD.listStoredChatIds = (...args) => owner.listStoredChatIds(...args);
  MOD.listTagPool = (...args) => owner.listTagPool(...args);
  MOD.setTagColor = (...args) => owner.setTagColor(...args);
  MOD.renameTag = (...args) => owner.renameTag(...args);
  MOD.getChatMode = (...args) => owner.getChatMode(...args);
  MOD.setChatMode = (...args) => owner.setChatMode(...args);
  MOD.getTurnSuggestions = (...args) => owner.getTurnSuggestions(...args);
  MOD.acceptSuggestion = (...args) => owner.acceptSuggestion(...args);
  MOD.dismissSuggestion = (...args) => owner.dismissSuggestion(...args);
  MOD.addPoolTagToTurn = (...args) => owner.addPoolTagToTurn(...args);
  MOD.createAndAddTagToTurn = (...args) => owner.createAndAddTagToTurn(...args);
  MOD.removeTurnTag = (...args) => owner.removeTurnTag(...args);
  MOD.openTagPoolPopup = (...args) => owner.openTagPoolPopup(...args);
  MOD.setManualTags = (...args) => owner.setManualTags(...args);
  MOD.addManualTag = (...args) => owner.addManualTag(...args);
  MOD.removeManualTag = (...args) => owner.removeManualTag(...args);
  MOD.pinTag = (...args) => owner.pinTag(...args);
  MOD.hideTag = (...args) => owner.hideTag(...args);
  MOD.rebuildChat = (...args) => owner.rebuildChat(...args);
  MOD.projectChatMetadata = (...args) => owner.projectChatMetadata(...args);
  MOD.attachTurnUi = (...args) => owner.attachTurnUi(...args);
  MOD.detachTurnUi = (...args) => owner.detachTurnUi(...args);
  MOD.selfCheck = (...args) => owner.selfCheck(...args);
  MOD.getTagUsageIndex = (...args) => owner.getTagUsageIndex(...args);
  MOD.getTagUsageRefs = (...args) => owner.getTagUsageRefs(...args);
  MOD.listAllChatTags = (...args) => owner.listAllChatTags(...args);
  MOD.listChatsByTag = (...args) => owner.listChatsByTag(...args);
  MOD.openTagsViewer = (...args) => owner.openTagsViewer(...args);
  MOD.openTagViewer = (...args) => owner.openTagViewer(...args);
  MOD.closeTagViewer = (...args) => owner.closeTagViewer(...args);
  MOD.renderTagsIntoList = (...args) => owner.renderTagsIntoList(...args);
  MOD.openTagEditorPopup = (...args) => owner.openTagEditorPopup(...args);
  MOD.closeTagEditorPopup = (...args) => owner.closeTagEditorPopup(...args);
  MOD.getCurrentChatTagCount = (...args) => owner.getCurrentChatTagCount(...args);
  MOD.openTurnByRef = (...args) => owner.openTurnByRef(...args);
  MOD.scrollToAnswerInDom = (...args) => owner.scrollToAnswerInDom(...args);
  MOD.compactStorage = (...args) => owner.compactStorage(...args);
  MOD.cleanupMigratedV1Storage = (...args) => owner.cleanupMigratedV1Storage(...args);
  // Phase 4 aliases (so `H2O.Tags.getTagAutoPool()` etc. work just like every other public method).
  MOD.getTagAutoPool = (...args) => owner.getTagAutoPool(...args);
  MOD.getTagAutoPoolDiagnostics = (...args) => owner.getTagAutoPoolDiagnostics(...args);
  MOD.refreshTagAutoPool = (...args) => owner.refreshTagAutoPool(...args);
  MOD.getOccurrenceIndex = (...args) => owner.getOccurrenceIndex(...args);
  MOD.findTagOccurrences = (...args) => owner.findTagOccurrences(...args);
  // Phase 5.5
  MOD.getTagBubbleCloudDiagnostics = (...args) => owner.getTagBubbleCloudDiagnostics(...args);

  function bindCoreEvents() {
    const onIndexUpdated = () => {
      const timer = W.setTimeout(() => {
        state.clean.timers.delete(timer);
        rescanVisibleTitleBars('core:index-updated');
      }, getCfg().autoAnalyzeDebounceMs);
      state.clean.timers.add(timer);
    };

    const onHashChange = () => {
      const timer = W.setTimeout(() => {
        state.clean.timers.delete(timer);
        rescanVisibleTitleBars('hashchange');
        checkPendingTurnNav();
      }, getCfg().autoAnalyzeDebounceMs);
      state.clean.timers.add(timer);
    };

    W.addEventListener('evt:h2o:core:index:updated', onIndexUpdated, true);
    W.addEventListener('hashchange', onHashChange, true);
    W.addEventListener('popstate', onHashChange, true);

    state.clean.listeners.add(() => W.removeEventListener('evt:h2o:core:index:updated', onIndexUpdated, true));
    state.clean.listeners.add(() => W.removeEventListener('hashchange', onHashChange, true));
    state.clean.listeners.add(() => W.removeEventListener('popstate', onHashChange, true));
  }

  function boot() {
    if (state.booted) return;
    state.booted = true;
    ensureStyle();
    getCfg();
    ensureCompactStorageState();
    bindCoreEvents();

    // Phase 4: kick off the async auto-pool prefetch so the in-memory cache is warm by the
    // time the first aggregateChat side-output runs. Non-blocking; if Store isn't ready
    // (legacy/degraded), the cache initializes empty and side-outputs accumulate locally.
    try { ensureAutoPoolCacheLoaded().catch((e) => err('boot:auto-pool-load', e)); }
    catch (e) { err('boot:auto-pool-load:throw', e); }

    // Phase 4 hardening: listen for Library Store tier promotion (e.g., MV3 SW cold-start
    // race resolved by a boot-retry reprobe). When Store promotes from a non-durable
    // backend (localStorage) to a durable one (bridge), drop the in-memory auto-pool cache
    // so subsequent reads/writes flow through the now-durable backend. Without this, Tags
    // would keep using the empty cache it loaded from localStorage at boot.
    try {
      const onStorePromoted = (e) => {
        const detail = e?.detail || {};
        if (!detail.durable) return;
        // Reset cache + load promise so the next ensureAutoPoolCacheLoaded() reloads from
        // the now-durable Store. In-flight flushes are still gated by isStoreDurableNow()
        // and will succeed on the next aggregateChat / refreshTagAutoPool call.
        state.autoPoolCache = null;
        state.autoPoolLoadPromise = null;
        ensureAutoPoolCacheLoaded().catch((er) => err('store-promoted:reload', er));
      };
      W.addEventListener('evt:h2o:library:store:tier-promoted', onStorePromoted, true);
      W.addEventListener('h2o:library:store:tier-promoted', onStorePromoted, true);
      state.clean.listeners.add(() => W.removeEventListener('evt:h2o:library:store:tier-promoted', onStorePromoted, true));
      state.clean.listeners.add(() => W.removeEventListener('h2o:library:store:tier-promoted', onStorePromoted, true));
    } catch (e) { err('boot:store-promoted-listener', e); }

    try {
      core.registerOwner?.('tags', owner, { replace: true });
      core.registerService?.('tags', owner, { replace: true });
      // Intentionally NO core.registerRoute('tags', ...) in v1.
      // Viewer APIs are public now; route registration is deferred until they are tested.
      step('tags-owner-registered');
    } catch (e) {
      err('register-tags-owner', e);
    }

    const timer = W.setTimeout(() => {
      state.clean.timers.delete(timer);
      rescanVisibleTitleBars('boot');
      checkPendingTurnNav();
    }, 80);
    state.clean.timers.add(timer);

    if (!state.compactStorage.bootScheduled) {
      state.compactStorage.bootScheduled = true;
      const compactTimer = W.setTimeout(() => {
        state.clean.timers.delete(compactTimer);
        try { compactStorage({ source: 'boot' }); } catch (e) { err('tags-compact-boot', e); }
      }, 240);
      state.clean.timers.add(compactTimer);
    }
  }

  boot();
})();
