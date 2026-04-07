// ==UserScript==
// @h2o-id             3x2a.workspace.core
// @name               3X2a.🔶🎯 Workspace Core 🎯
// @namespace          H2O.Premium.CGX.workspace.core
// @author             HumamDev
// @version            0.1.2
// @revision           001
// @build              260310-000000
// @description        Workspace Core: Pack Registry + Module Registry + Chat Profile + Artifact Store + Right Shell state. Exposes H2O.Workspace public API. Shelf/Drawer UI should attach to this core.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Workspace Core (Contract v1, Stage 0: Runtime Skeleton) 🧠🧩
   * - Owns: pack registry + module registry + chat profile + artifact store
   * - Owns: right shell state for Shelf / Drawer
   * - Exposes: VAULT.api.getContract() + window.H2O.Workspace
   * - UI is external: Shelf UI / Drawer UI / Catalog UI should consume this API
   * - Intentionally stubbed: module execution, suggestions, sync adapters, deep chat analysis
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */

  const TOK = 'WS';
  const PID = 'wrkspc';
  const CID = 'wrkspcec';
  const SkID = 'wkspc';

  const MODTAG = 'WorkCore';
  const MODICON = '🧠';
  const EMOJI_HDR = '🟦';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};

  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || {
    tok: TOK,
    pid: PID,
    cid: CID,
    skid: SkID,
    modtag: MODTAG,
    suite: SUITE,
    host: HOST,
  };

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── 1) Tokens (NS_/KEY_/EV_/ATTR_/STR_/CFG_) ───────────────────────────── */

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_MEM_GUARD = `${TOK}:${PID}:guard`;
  const NS_MEM_ONCE  = `${TOK}:${PID}:once`;

  const KEY_WS_GUARD_BOOT             = `${NS_MEM_GUARD}:booted`;
  const KEY_WS_GUARD_NAV              = `${NS_MEM_GUARD}:navHook`;
  const KEY_WS_GUARD_MO               = `${NS_MEM_GUARD}:mo`;

  const KEY_WS_REG_PACKS_V1           = `${NS_DISK}:registry:packs:v1`;
  const KEY_WS_REG_MODULES_V1         = `${NS_DISK}:registry:modules:v1`;
  const KEY_WS_REG_SYNC_ADAPTERS_V1   = `${NS_DISK}:registry:sync_adapters:v1`;

  const KEY_WS_UI_RIGHT_SHELL_V1      = `${NS_DISK}:state:right_shell:v1`;
  const KEY_WS_UI_SHELF_V1            = `${NS_DISK}:state:shelf_ui:v1`;
  const KEY_WS_UI_DRAWER_V1           = `${NS_DISK}:state:drawer_ui:v1`;

  const KEY_WS_LIB_INSTALLED_PACKS_V1 = `${NS_DISK}:library:installed_packs:v1`;
  const KEY_WS_LIB_CATALOG_CACHE_V1   = `${NS_DISK}:library:catalog_cache:v1`;
  const KEY_WS_SYNC_QUEUE_V1          = `${NS_DISK}:sync:queue:v1`;
  const KEY_WS_SYNC_BINDINGS_V1       = `${NS_DISK}:sync:bindings:v1`;
  const KEY_WS_MIG_STATE_V1           = `${NS_DISK}:migrate:state:v1`;

  const EV_WS_READY                 = 'h2o:wrkspc:ready';
  const EV_WS_PACKS_CHANGED         = 'h2o:wrkspc:packs:changed';
  const EV_WS_MODULES_CHANGED       = 'h2o:wrkspc:modules:changed';
  const EV_WS_CHAT_PROFILE_CHANGED  = 'h2o:wrkspc:chat_profile:changed';
  const EV_WS_ARTIFACTS_CHANGED     = 'h2o:wrkspc:artifacts:changed';
  const EV_WS_RIGHT_SHELL_CHANGED   = 'h2o:wrkspc:right_shell:changed';
  const EV_WS_MODULE_RUN_REQUEST    = 'h2o:wrkspc:module:run:request';
  const EV_WS_MODULE_RUN_DONE       = 'h2o:wrkspc:module:run:done';
  const EV_WS_MODULE_RUN_FAILED     = 'h2o:wrkspc:module:run:failed';
  const EV_WS_SYNC_PUSH_DONE        = 'h2o:wrkspc:sync:push:done';
  const EV_WS_SYNC_PULL_DONE        = 'h2o:wrkspc:sync:pull:done';

  const ATTR_WS = Object.freeze({
    marker: '__H2O_WORKSPACE__',
  });

  const STR_WS = Object.freeze({
    unknown: 'unknown',
    apiName: 'Workspace',
    chatPathRe: /\/c\/([a-z0-9-]+)/i,
    paneShelf: 'shelf',
    paneDrawer: 'drawer',
    modeDock: 'dock',
    modeOverlay: 'overlay',
  });

  const CFG_WS = Object.freeze({
    diagStepsMax: 180,
    moObserveSubtree: true,
    exportVersion: '0.1.0',
    shellState0: Object.freeze({
      open: false,
      pane: STR_WS.paneShelf,     // shelf | drawer
      dockMode: STR_WS.modeOverlay, // dock | overlay
      width: 360,
      activePackId: '',
    }),
    shelfUi0: Object.freeze({
      view: 'packs',   // packs | modules | catalog
      q: '',
      sort: 'default',
      category: 'all',
    }),
    drawerUi0: Object.freeze({
      view: 'cards',   // cards | table | timeline | board
      q: '',
      sort: 'updated_desc',
      type: 'all',
    }),
  });

  /* ───────────────────────────── 2) DIAG (bounded) ───────────────────────────── */

  VAULT.diag = VAULT.diag || {
    ver: 'workspace-v1-skeleton',
    bootCount: 0,
    lastBootAt: 0,
    steps: [],
    lastError: null,
  };

  function DIAG_WS_step(name, extra) {
    const d = VAULT.diag;
    d.steps.push({ t: Date.now(), name, extra: extra ?? null });
    if (d.steps.length > CFG_WS.diagStepsMax) d.steps.shift();
  }

  function DIAG_WS_safe(name, extra) {
    try { DIAG_WS_step(name, extra); } catch (_) {}
  }

  /* ───────────────────────────── 3) Runtime State + Registries (vault-bound) ───────────────────────────── */

  VAULT.state = VAULT.state || {
    booted: false,
    chatId: STR_WS.unknown,
    mo: null,
    onPop: null,
    handlers: {
      onError: null,
      onRejection: null,
    },
  };

  VAULT.reg = VAULT.reg || {
    packs: Object.create(null),        // { [packId]: packManifest }
    modules: Object.create(null),      // { [moduleId]: moduleManifest }
    moduleRunners: Object.create(null), // { [moduleId]: (ctx) => result | Promise<result> }
    syncAdapters: Object.create(null), // { [adapterId]: adapter }
  };

  VAULT.cache = VAULT.cache || {
    chatProfiles: Object.create(null), // memo by chatId
    artifacts: Object.create(null),    // memo by chatId => array
  };

  const S = VAULT.state;
  const REG = VAULT.reg;
  const CACHE = VAULT.cache;

  /* ───────────────────────────── 4) Helpers ───────────────────────────── */

  function UTIL_WS_now() {
    return Date.now();
  }

  function UTIL_WS_safeParseJSON(s, fallback) {
    if (typeof W.H2O?.util?.safeParse === 'function') return W.H2O.util.safeParse(s, fallback);
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function UTIL_WS_lsGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(String(key || ''));
      return raw == null ? fallback : raw;
    } catch {
      return fallback;
    }
  }

  function UTIL_WS_lsSet(key, val) {
    try { localStorage.setItem(String(key || ''), String(val ?? '')); } catch (_) {}
  }

  function UTIL_WS_lsDel(key) {
    try { localStorage.removeItem(String(key || '')); } catch (_) {}
  }

  function UTIL_WS_emit(evName, detail = null) {
    const payload = {
      ...(detail && typeof detail === 'object' ? detail : {}),
      [ATTR_WS.marker]: true,
    };

    if (typeof W.H2O?.events?.emit === 'function') {
      try { W.H2O.events.emit(evName, payload); } catch (_) {}
      return;
    }

    try { W.dispatchEvent(new CustomEvent(evName, { detail: payload })); } catch (_) {}
  }

  function UTIL_WS_cryptoId(prefix = 'ws') {
    const r = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${r}`;
  }

  function UTIL_WS_getChatId() {
    const v = W.H2O?.util?.getChatId?.();
    if (v) return String(v);

    const m = String(location.pathname || '').match(STR_WS.chatPathRe);
    return m ? String(m[1]) : STR_WS.unknown;
  }

  function UTIL_WS_normTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
      .map(t => String(t || '').trim())
      .filter(Boolean)
      .slice(0, 24);
  }

  function UTIL_WS_keyChatProfile(chatId) {
    return `${NS_DISK}:chat:profile:v1:${String(chatId || STR_WS.unknown)}`;
  }

  function UTIL_WS_keyChatArtifacts(chatId) {
    return `${NS_DISK}:chat:artifacts:v1:${String(chatId || STR_WS.unknown)}`;
  }

  function UTIL_WS_keyChatModuleState(chatId, moduleId) {
    return `${NS_DISK}:chat:module_state:v1:${String(chatId || STR_WS.unknown)}:${String(moduleId || '')}`;
  }

  function UTIL_WS_clone(v) {
    try { return JSON.parse(JSON.stringify(v)); }
    catch { return v; }
  }

  /* ───────────────────────────── 5) Persistence (skeleton) ───────────────────────────── */

  function STORE_WS_loadShellState() {
    const raw = UTIL_WS_lsGet(KEY_WS_UI_RIGHT_SHELL_V1, '');
    const v = UTIL_WS_safeParseJSON(raw, null);
    return (v && typeof v === 'object') ? { ...CFG_WS.shellState0, ...v } : { ...CFG_WS.shellState0 };
  }

  function STORE_WS_saveShellState(partial) {
    const cur = STORE_WS_loadShellState();
    const next = { ...cur, ...(partial || {}) };
    UTIL_WS_lsSet(KEY_WS_UI_RIGHT_SHELL_V1, JSON.stringify(next));
    return next;
  }

  function STORE_WS_loadShelfUi() {
    const raw = UTIL_WS_lsGet(KEY_WS_UI_SHELF_V1, '');
    const v = UTIL_WS_safeParseJSON(raw, null);
    return (v && typeof v === 'object') ? { ...CFG_WS.shelfUi0, ...v } : { ...CFG_WS.shelfUi0 };
  }

  function STORE_WS_saveShelfUi(partial) {
    const cur = STORE_WS_loadShelfUi();
    const next = { ...cur, ...(partial || {}) };
    UTIL_WS_lsSet(KEY_WS_UI_SHELF_V1, JSON.stringify(next));
    return next;
  }

  function STORE_WS_loadDrawerUi() {
    const raw = UTIL_WS_lsGet(KEY_WS_UI_DRAWER_V1, '');
    const v = UTIL_WS_safeParseJSON(raw, null);
    return (v && typeof v === 'object') ? { ...CFG_WS.drawerUi0, ...v } : { ...CFG_WS.drawerUi0 };
  }

  function STORE_WS_saveDrawerUi(partial) {
    const cur = STORE_WS_loadDrawerUi();
    const next = { ...cur, ...(partial || {}) };
    UTIL_WS_lsSet(KEY_WS_UI_DRAWER_V1, JSON.stringify(next));
    return next;
  }

  function STORE_WS_loadPackRegistryDisk() {
    const raw = UTIL_WS_lsGet(KEY_WS_REG_PACKS_V1, '');
    const v = UTIL_WS_safeParseJSON(raw, null);
    return (v && typeof v === 'object') ? v : Object.create(null);
  }

  function STORE_WS_savePackRegistryDisk(mapObj) {
    UTIL_WS_lsSet(KEY_WS_REG_PACKS_V1, JSON.stringify(mapObj || Object.create(null)));
  }

  function STORE_WS_loadModuleRegistryDisk() {
    const raw = UTIL_WS_lsGet(KEY_WS_REG_MODULES_V1, '');
    const v = UTIL_WS_safeParseJSON(raw, null);
    return (v && typeof v === 'object') ? v : Object.create(null);
  }

  function STORE_WS_saveModuleRegistryDisk(mapObj) {
    UTIL_WS_lsSet(KEY_WS_REG_MODULES_V1, JSON.stringify(mapObj || Object.create(null)));
  }

  function STORE_WS_loadChatProfile(chatId = S.chatId) {
    const key = UTIL_WS_keyChatProfile(chatId);
    const raw = UTIL_WS_lsGet(key, '');
    const v = UTIL_WS_safeParseJSON(raw, null);
    if (v && typeof v === 'object') return v;

    return {
      chatId: String(chatId || STR_WS.unknown),
      title: '',
      detectedDomains: [],
      activePackIds: [],
      pinnedModuleIds: [],
      attachmentCount: 0,
      noteCount: 0,
      highlightCount: 0,
      labels: [],
      entities: [],
      lastOpenedAt: UTIL_WS_now(),
      lastAnalyzedAt: 0,
      prefs: {
        primaryPackId: '',
        shelfLayout: 'grid',
        drawerView: 'cards',
      },
    };
  }

  function STORE_WS_saveChatProfile(profile, chatId = S.chatId) {
    const key = UTIL_WS_keyChatProfile(chatId);
    UTIL_WS_lsSet(key, JSON.stringify(profile || STORE_WS_loadChatProfile(chatId)));
    CACHE.chatProfiles[String(chatId || STR_WS.unknown)] = profile || STORE_WS_loadChatProfile(chatId);
  }

  function STORE_WS_loadArtifacts(chatId = S.chatId) {
    const key = UTIL_WS_keyChatArtifacts(chatId);
    const raw = UTIL_WS_lsGet(key, '');
    const v = UTIL_WS_safeParseJSON(raw, []);
    return Array.isArray(v) ? v : [];
  }

  function STORE_WS_saveArtifacts(arr, chatId = S.chatId) {
    const key = UTIL_WS_keyChatArtifacts(chatId);
    UTIL_WS_lsSet(key, JSON.stringify(Array.isArray(arr) ? arr : []));
    CACHE.artifacts[String(chatId || STR_WS.unknown)] = Array.isArray(arr) ? arr : [];
  }

  /* ───────────────────────────── 6) Registry API (partly functional) ───────────────────────────── */

  function API_WS_registerPack(pack) {
    const id = String(pack?.id || '').trim();
    if (!id) return false;

    REG.packs[id] = {
      id,
      title: String(pack?.title || id),
      icon: String(pack?.icon || ''),
      version: String(pack?.version || '0.0.0'),
      kind: String(pack?.kind || 'private'),
      status: String(pack?.status || 'active'),
      description: String(pack?.description || ''),
      tags: UTIL_WS_normTags(pack?.tags),
      moduleIds: Array.isArray(pack?.moduleIds) ? pack.moduleIds.slice() : [],
      artifactTypes: Array.isArray(pack?.artifactTypes) ? pack.artifactTypes.slice() : [],
      permissionsEnvelope: { ...(pack?.permissionsEnvelope || {}) },
      triggers: Array.isArray(pack?.triggers) ? pack.triggers.slice() : [],
      installSource: String(pack?.installSource || 'local'),
      trustTier: String(pack?.trustTier || 'safe-block'),
    };

    STORE_WS_savePackRegistryDisk(REG.packs);
    UTIL_WS_emit(EV_WS_PACKS_CHANGED, { packId: id, reason: 'register' });
    return true;
  }

  function API_WS_unregisterPack(packId) {
    const id = String(packId || '').trim();
    if (!id || !REG.packs[id]) return false;
    delete REG.packs[id];
    STORE_WS_savePackRegistryDisk(REG.packs);
    UTIL_WS_emit(EV_WS_PACKS_CHANGED, { packId: id, reason: 'unregister' });
    return true;
  }

  function API_WS_getPack(packId) {
    const id = String(packId || '').trim();
    return id ? (REG.packs[id] ? UTIL_WS_clone(REG.packs[id]) : null) : null;
  }

  function API_WS_listPacks(filter = null) {
    let arr = Object.values(REG.packs || {});
    if (filter?.kind) arr = arr.filter(x => x?.kind === filter.kind);
    if (filter?.status) arr = arr.filter(x => x?.status === filter.status);
    if (filter?.trustTier) arr = arr.filter(x => x?.trustTier === filter.trustTier);
    if (filter?.tag) arr = arr.filter(x => Array.isArray(x?.tags) && x.tags.includes(filter.tag));
    return arr.map(UTIL_WS_clone);
  }

  function API_WS_registerModule(mod) {
    const id = String(mod?.id || '').trim();
    if (!id) return false;

    REG.modules[id] = {
      id,
      packId: String(mod?.packId || ''),
      title: String(mod?.title || id),
      icon: String(mod?.icon || ''),
      version: String(mod?.version || '0.0.0'),
      mode: String(mod?.mode || 'assistant'),
      trustTier: String(mod?.trustTier || 'safe-block'),
      description: String(mod?.description || ''),
      ui: { ...(mod?.ui || {}) },
      capabilities: { ...(mod?.capabilities || {}) },
      triggers: Array.isArray(mod?.triggers) ? mod.triggers.slice() : [],
      inputs: Array.isArray(mod?.inputs) ? mod.inputs.slice() : [],
      outputs: Array.isArray(mod?.outputs) ? mod.outputs.slice() : [],
      settingsSchema: { ...(mod?.settingsSchema || {}) },
      artifactTemplateIds: Array.isArray(mod?.artifactTemplateIds) ? mod.artifactTemplateIds.slice() : [],
    };

    STORE_WS_saveModuleRegistryDisk(REG.modules);
    UTIL_WS_emit(EV_WS_MODULES_CHANGED, { moduleId: id, reason: 'register' });
    return true;
  }

  function API_WS_unregisterModule(moduleId) {
    const id = String(moduleId || '').trim();
    if (!id || !REG.modules[id]) return false;
    delete REG.modules[id];
    STORE_WS_saveModuleRegistryDisk(REG.modules);
    UTIL_WS_emit(EV_WS_MODULES_CHANGED, { moduleId: id, reason: 'unregister' });
    return true;
  }

  function API_WS_getModule(moduleId) {
    const id = String(moduleId || '').trim();
    return id ? (REG.modules[id] ? UTIL_WS_clone(REG.modules[id]) : null) : null;
  }

  function API_WS_listModules(filter = null) {
    let arr = Object.values(REG.modules || {});
    if (filter?.packId) arr = arr.filter(x => x?.packId === filter.packId);
    if (filter?.mode) arr = arr.filter(x => x?.mode === filter.mode);
    if (filter?.outputType) arr = arr.filter(x => Array.isArray(x?.outputs) && x.outputs.includes(filter.outputType));
    return arr.map(UTIL_WS_clone);
  }

  /* ───────────────────────────── 7) Chat Profile API (partly functional) ───────────────────────────── */

  function API_WS_getChatProfile(chatId = S.chatId) {
    const k = String(chatId || STR_WS.unknown);
    if (CACHE.chatProfiles[k]) return UTIL_WS_clone(CACHE.chatProfiles[k]);
    const v = STORE_WS_loadChatProfile(k);
    CACHE.chatProfiles[k] = v;
    return UTIL_WS_clone(v);
  }

  function API_WS_saveChatProfile(patch, chatId = S.chatId) {
    const cur = STORE_WS_loadChatProfile(chatId);
    const next = {
      ...cur,
      ...(patch || {}),
      chatId: String(chatId || cur.chatId || STR_WS.unknown),
      detectedDomains: Array.isArray(patch?.detectedDomains) ? patch.detectedDomains.slice() : cur.detectedDomains,
      activePackIds: Array.isArray(patch?.activePackIds) ? patch.activePackIds.slice() : cur.activePackIds,
      pinnedModuleIds: Array.isArray(patch?.pinnedModuleIds) ? patch.pinnedModuleIds.slice() : cur.pinnedModuleIds,
      labels: Array.isArray(patch?.labels) ? patch.labels.slice() : cur.labels,
      entities: Array.isArray(patch?.entities) ? patch.entities.slice() : cur.entities,
      prefs: { ...(cur.prefs || {}), ...(patch?.prefs || {}) },
      lastOpenedAt: patch?.lastOpenedAt ?? cur.lastOpenedAt,
      lastAnalyzedAt: patch?.lastAnalyzedAt ?? cur.lastAnalyzedAt,
    };

    STORE_WS_saveChatProfile(next, chatId);
    UTIL_WS_emit(EV_WS_CHAT_PROFILE_CHANGED, { chatId: next.chatId, reason: 'save' });
    return UTIL_WS_clone(next);
  }

  function API_WS_bindChatProfile(chatId = null) {
    const nextChatId = String(chatId || UTIL_WS_getChatId());
    if (nextChatId === S.chatId) return API_WS_getChatProfile(nextChatId);

    S.chatId = nextChatId;
    const next = API_WS_getChatProfile(nextChatId);
    API_WS_saveChatProfile({ lastOpenedAt: UTIL_WS_now() }, nextChatId);
    DIAG_WS_safe('chat:bind', { chatId: nextChatId });
    return next;
  }

  function API_WS_activatePack(packId, chatId = S.chatId) {
    const id = String(packId || '').trim();
    if (!id) return false;

    const p = API_WS_getChatProfile(chatId);
    const set = new Set(Array.isArray(p.activePackIds) ? p.activePackIds : []);
    set.add(id);

    API_WS_saveChatProfile({ activePackIds: Array.from(set) }, chatId);
    UTIL_WS_emit(EV_WS_PACKS_CHANGED, { chatId, packId: id, reason: 'activate' });
    return true;
  }

  function API_WS_deactivatePack(packId, chatId = S.chatId) {
    const id = String(packId || '').trim();
    if (!id) return false;

    const p = API_WS_getChatProfile(chatId);
    const next = (Array.isArray(p.activePackIds) ? p.activePackIds : []).filter(x => x !== id);

    API_WS_saveChatProfile({ activePackIds: next }, chatId);
    UTIL_WS_emit(EV_WS_PACKS_CHANGED, { chatId, packId: id, reason: 'deactivate' });
    return true;
  }

  function API_WS_listActivePacks(chatId = S.chatId) {
    const p = API_WS_getChatProfile(chatId);
    return Array.isArray(p.activePackIds) ? p.activePackIds.slice() : [];
  }

  function API_WS_pinModule(moduleId, chatId = S.chatId) {
    const id = String(moduleId || '').trim();
    if (!id) return false;

    const p = API_WS_getChatProfile(chatId);
    const set = new Set(Array.isArray(p.pinnedModuleIds) ? p.pinnedModuleIds : []);
    set.add(id);

    API_WS_saveChatProfile({ pinnedModuleIds: Array.from(set) }, chatId);
    return true;
  }

  function API_WS_unpinModule(moduleId, chatId = S.chatId) {
    const id = String(moduleId || '').trim();
    if (!id) return false;

    const p = API_WS_getChatProfile(chatId);
    const next = (Array.isArray(p.pinnedModuleIds) ? p.pinnedModuleIds : []).filter(x => x !== id);

    API_WS_saveChatProfile({ pinnedModuleIds: next }, chatId);
    return true;
  }

  function API_WS_listPinnedModules(chatId = S.chatId) {
    const p = API_WS_getChatProfile(chatId);
    return Array.isArray(p.pinnedModuleIds) ? p.pinnedModuleIds.slice() : [];
  }

  /* ───────────────────────────── 8) Artifact API (partly functional) ───────────────────────────── */

  function API_WS_listArtifacts(filter = null) {
    const chatId = String(filter?.chatId || S.chatId || STR_WS.unknown);
    let arr = STORE_WS_loadArtifacts(chatId);

    if (filter?.type)     arr = arr.filter(x => x?.type === filter.type);
    if (filter?.packId)   arr = arr.filter(x => x?.packId === filter.packId);
    if (filter?.moduleId) arr = arr.filter(x => x?.moduleId === filter.moduleId);
    if (filter?.status)   arr = arr.filter(x => x?.status === filter.status);
    if (filter?.tag)      arr = arr.filter(x => Array.isArray(x?.tags) && x.tags.includes(filter.tag));
    if (filter?.pinned != null) arr = arr.filter(x => !!x?.pinned === !!filter.pinned);

    return arr
      .slice()
      .sort((a, b) => {
        const ap = a?.pinned ? 0 : 1;
        const bp = b?.pinned ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (b?.updatedAt || b?.createdAt || 0) - (a?.updatedAt || a?.createdAt || 0);
      })
      .map(UTIL_WS_clone);
  }

  function API_WS_getArtifact(id, chatId = S.chatId) {
    const arr = STORE_WS_loadArtifacts(chatId);
    const item = arr.find(x => x && x.id === id) || null;
    return item ? UTIL_WS_clone(item) : null;
  }

  function API_WS_saveArtifact(record) {
    const chatId = String(record?.chatId || S.chatId || STR_WS.unknown);
    const arr = STORE_WS_loadArtifacts(chatId);
    const now = UTIL_WS_now();

    const item = {
      id: String(record?.id || UTIL_WS_cryptoId('art')),
      chatId,
      packId: String(record?.packId || ''),
      moduleId: String(record?.moduleId || ''),
      type: String(record?.type || 'artifact'),
      title: String(record?.title || '').trim(),
      body: String(record?.body || '').trim(),
      data: (record?.data && typeof record.data === 'object') ? { ...record.data } : {},
      status: String(record?.status || 'draft'),
      tags: UTIL_WS_normTags(record?.tags),
      pinned: !!record?.pinned,
      confidence: Number.isFinite(record?.confidence) ? Number(record.confidence) : null,
      sourceRefs: Array.isArray(record?.sourceRefs) ? record.sourceRefs.slice() : [],
      createdAt: now,
      updatedAt: now,
      sync: (record?.sync && typeof record.sync === 'object') ? { ...record.sync } : null,
    };

    arr.unshift(item);
    STORE_WS_saveArtifacts(arr, chatId);
    UTIL_WS_emit(EV_WS_ARTIFACTS_CHANGED, { chatId, artifactId: item.id, reason: 'add' });
    return UTIL_WS_clone(item);
  }

  function API_WS_updateArtifact(id, patch, chatId = S.chatId) {
    if (!id) return false;

    const arr = STORE_WS_loadArtifacts(chatId);
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;

    const cur = arr[i];
    const now = UTIL_WS_now();

    arr[i] = {
      ...cur,
      ...(patch || {}),
      title:  (patch?.title  != null) ? String(patch.title).trim() : cur.title,
      body:   (patch?.body   != null) ? String(patch.body).trim()  : cur.body,
      tags:   (patch?.tags   != null) ? UTIL_WS_normTags(patch.tags) : cur.tags,
      pinned: (patch?.pinned != null) ? !!patch.pinned : !!cur.pinned,
      data:   (patch?.data   != null && typeof patch.data === 'object') ? { ...patch.data } : cur.data,
      sync:   (patch?.sync   != null && typeof patch.sync === 'object') ? { ...patch.sync } : cur.sync,
      updatedAt: now,
    };

    STORE_WS_saveArtifacts(arr, chatId);
    UTIL_WS_emit(EV_WS_ARTIFACTS_CHANGED, { chatId, artifactId: id, reason: 'update' });
    return true;
  }

  function API_WS_removeArtifact(id, chatId = S.chatId) {
    if (!id) return false;
    const arr = STORE_WS_loadArtifacts(chatId);
    const next = arr.filter(x => x && x.id !== id);
    if (next.length === arr.length) return false;

    STORE_WS_saveArtifacts(next, chatId);
    UTIL_WS_emit(EV_WS_ARTIFACTS_CHANGED, { chatId, artifactId: id, reason: 'remove' });
    return true;
  }

  function API_WS_bulkSaveArtifacts(records) {
    if (!Array.isArray(records) || !records.length) return [];
    const out = [];
    for (const rec of records) {
      const item = API_WS_saveArtifact(rec);
      if (item) out.push(item);
    }
    return out;
  }

  function API_WS_clearArtifactsByType(type, chatId = S.chatId) {
    const t = String(type || '').trim();
    if (!t) return false;

    const arr = STORE_WS_loadArtifacts(chatId);
    const next = arr.filter(x => x?.type !== t);
    if (next.length === arr.length) return false;

    STORE_WS_saveArtifacts(next, chatId);
    UTIL_WS_emit(EV_WS_ARTIFACTS_CHANGED, { chatId, type: t, reason: 'clearByType' });
    return true;
  }

  function API_WS_exportArtifactsJSON(chatId = S.chatId) {
    const payload = {
      chatId: String(chatId || STR_WS.unknown),
      profile: STORE_WS_loadChatProfile(chatId),
      artifacts: STORE_WS_loadArtifacts(chatId),
      exportedAt: UTIL_WS_now(),
      version: CFG_WS.exportVersion,
    };
    return JSON.stringify(payload, null, 2);
  }

  /* ───────────────────────────── 9) Module Runtime ───────────────────────────── */

  function API_WS_registerModuleRunner(moduleId, fn) {
    const id = String(moduleId || '').trim();
    if (!id || typeof fn !== 'function') return false;
    REG.moduleRunners[id] = fn;
    return true;
  }

  function API_WS_unregisterModuleRunner(moduleId) {
    const id = String(moduleId || '').trim();
    if (!id || !REG.moduleRunners[id]) return false;
    delete REG.moduleRunners[id];
    return true;
  }

  function API_WS_getModuleRunner(moduleId) {
    const id = String(moduleId || '').trim();
    return id ? (REG.moduleRunners[id] || null) : null;
  }

  function API_WS_inspectSelectionContext() {
    const sel = W.getSelection?.();
    if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;

    const text = String(sel.toString() || '').trim();
    if (!text) return null;

    const anchorNode = sel.anchorNode || null;
    const el =
      anchorNode?.nodeType === 1 ? anchorNode :
      anchorNode?.parentElement || null;

    const turnEl =
      el?.closest?.('[data-testid^="conversation-turn-"], [id^="conversation-turn-"]') ||
      el?.closest?.('[data-message-author-role]') ||
      null;

    const msgId =
      turnEl?.getAttribute?.('data-testid') ||
      turnEl?.id ||
      '';

    const role =
      turnEl?.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role') ||
      turnEl?.getAttribute?.('data-message-author-role') ||
      'unknown';

    const turnText = String(turnEl?.innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2400);

    return {
      text,
      msgId: String(msgId || ''),
      role: String(role || 'unknown'),
      turnText,
      selectedAt: UTIL_WS_now(),
    };
  }

  function API_WS_getVisibleTurns({ limit = 80 } = {}) {
    const nodes = Array.from(
      D.querySelectorAll('[data-testid^="conversation-turn-"], [id^="conversation-turn-"], [data-message-author-role]')
    ).slice(-Math.max(1, Number(limit || 80)));

    const out = [];
    const seen = new Set();

    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const msgId =
        el.getAttribute?.('data-testid') ||
        el.id ||
        `turn_${i}`;

      if (seen.has(msgId)) continue;
      seen.add(msgId);

      const role =
        el.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role') ||
        el.getAttribute?.('data-message-author-role') ||
        'unknown';

      const text = String(el.innerText || '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) continue;

      out.push({
        idx: out.length,
        msgId: String(msgId || ''),
        role: String(role || 'unknown'),
        text,
      });
    }

    return out;
  }

  function API_WS_snapshotChatTurns({ scope = 'visible', limit = 80 } = {}) {
    // stage-1: visible snapshot only
    return API_WS_getVisibleTurns({ limit });
  }

  function API_WS_createPromptCapsule({ title, body, packId, moduleId, sourceRefs = [], data = {} } = {}) {
    return API_WS_saveArtifact({
      type: 'prompt_capsule',
      title: String(title || 'Prompt Capsule'),
      body: String(body || '').trim(),
      packId: String(packId || ''),
      moduleId: String(moduleId || ''),
      status: 'ready',
      tags: ['prompt', 'capsule'],
      sourceRefs: Array.isArray(sourceRefs) ? sourceRefs.slice() : [],
      data: {
        approvalRequired: true,
        sendMode: 'insert-only',
        ...(data || {}),
      },
    });
  }

  function API_WS_markPromptCapsuleUsed(capsuleId, chatId = S.chatId) {
    const item = API_WS_getArtifact(capsuleId, chatId);
    if (!item || item.type !== 'prompt_capsule') return false;
    return API_WS_updateArtifact(capsuleId, {
      status: 'used',
      data: {
        ...(item.data || {}),
        usedAt: UTIL_WS_now(),
      },
    }, chatId);
  }

  function API_WS_isVisibleComposerEl(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = W.getComputedStyle(el);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function API_WS_pickComposerTarget() {
  const selectors = [
    'form textarea',
    'textarea[placeholder]',
    'textarea[data-id]',
    'textarea',
    'form [contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][role="textbox"]',
    '.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"][data-id]',
    '[contenteditable="true"]',
  ];

  for (const sel of selectors) {
    const nodes = Array.from(D.querySelectorAll(sel)).filter(API_WS_isVisibleComposerEl);
    if (nodes.length) return nodes[0];
  }

  return null;
}

function API_WS_setNativeTextareaValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && typeof desc.set === 'function') {
    desc.set.call(el, value);
  } else {
    el.value = value;
  }
}

function API_WS_placeCaretAtEnd(el) {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const len = String(el.value || '').length;
      el.setSelectionRange(len, len);
      return true;
    }

    if (el && el.isContentEditable) {
      const range = D.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = W.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
  } catch (_) {}
  return false;
}

function API_WS_selectAllInEditable(el) {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.select();
      return true;
    }

    if (el && el.isContentEditable) {
      const range = D.createRange();
      range.selectNodeContents(el);
      const sel = W.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
  } catch (_) {}
  return false;
}

function API_WS_insertIntoContentEditable(el, text, { replace = false } = {}) {
  try {
    el.focus();

    if (replace) API_WS_selectAllInEditable(el);
    else API_WS_placeCaretAtEnd(el);

    try {
      const beforeEvt = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: replace ? 'insertReplacementText' : 'insertText',
        data: text,
      });
      el.dispatchEvent(beforeEvt);
    } catch (_) {}

    if (typeof D.execCommand === 'function') {
      const ok = D.execCommand('insertText', false, text);
      if (ok) {
        try {
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: replace ? 'insertReplacementText' : 'insertText',
            data: text,
          }));
        } catch (_) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      }
    }

    const sel = W.getSelection();
    if (!sel) return false;

    if (!sel.rangeCount) {
      API_WS_placeCaretAtEnd(el);
    }

    const range = sel.getRangeAt(0);
    if (replace) range.deleteContents();

    const node = D.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);

    try {
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: replace ? 'insertReplacementText' : 'insertText',
        data: text,
      }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  } catch (_) {
    return false;
  }
}

function API_WS_insertTextIntoComposer(text, { replace = false } = {}) {
  const v = String(text || '');
  if (!v) return false;

  const el = API_WS_pickComposerTarget();
  if (!el) return false;

  try {
    el.focus();

    if (el instanceof HTMLTextAreaElement) {
      const cur = String(el.value || '');
      const next = replace ? v : (cur ? `${cur}\n${v}` : v);

      API_WS_setNativeTextareaValue(el, next);

      try {
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: replace ? 'insertReplacementText' : 'insertText',
          data: v,
        }));
      } catch (_) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      try {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      API_WS_placeCaretAtEnd(el);
      return true;
    }

    if (el.isContentEditable) {
      const textToInsert = replace ? v : (() => {
        const cur = String(el.innerText || '').trim();
        return cur ? `\n${v}` : v;
      })();

      return API_WS_insertIntoContentEditable(el, textToInsert, { replace });
    }

    return false;
  } catch (_) {
    return false;
  }
}

  function API_WS_upsertArtifacts(records, { dedupeBy = null, mergeFn = null } = {}) {
    if (!Array.isArray(records) || !records.length) return [];

    const out = [];

    for (const rec of records) {
      const type = String(rec?.type || 'artifact');
      const list = API_WS_listArtifacts({ type });
      let hit = null;

      if (typeof dedupeBy === 'function') {
        hit = list.find((x) => dedupeBy(x, rec));
      } else if (Array.isArray(dedupeBy) && dedupeBy.length) {
        hit = list.find((x) => dedupeBy.every((k) => String(x?.[k] || '') === String(rec?.[k] || '')));
      }

      if (hit?.id) {
        const patch = typeof mergeFn === 'function' ? mergeFn(hit, rec) : rec;
        API_WS_updateArtifact(hit.id, patch);
        out.push(API_WS_getArtifact(hit.id));
      } else {
        out.push(API_WS_saveArtifact(rec));
      }
    }

    return out;
  }

  function API_WS_scoreExtractionCoverage({ artifactType, requiredFields = [] } = {}) {
    const items = API_WS_listArtifacts({ type: artifactType });
    if (!items.length) {
      return {
        count: 0,
        score: 0,
        missingFields: Array.isArray(requiredFields) ? requiredFields.slice() : [],
      };
    }

    const req = Array.isArray(requiredFields) ? requiredFields.slice() : [];
    let complete = 0;
    const missing = new Set();

    for (const item of items) {
      const data = (item?.data && typeof item.data === 'object') ? item.data : {};
      let ok = true;

      for (const f of req) {
        const hasTop = item?.[f] != null && String(item[f]).trim() !== '';
        const hasData = data?.[f] != null && String(data[f]).trim() !== '';
        if (!hasTop && !hasData) {
          ok = false;
          missing.add(f);
        }
      }

      if (ok) complete += 1;
    }

    return {
      count: items.length,
      score: Number((complete / Math.max(1, items.length)).toFixed(2)),
      missingFields: Array.from(missing),
    };
  }

  async function API_WS_runModule(moduleId, ctx = null) {
    const id = String(moduleId || '').trim();
    if (!id) {
      return { ok: false, reason: 'moduleId missing' };
    }

    const manifest = API_WS_getModule(id);
    if (!manifest) {
      return { ok: false, reason: `module not found: ${id}` };
    }

    const runner = API_WS_getModuleRunner(id);
    if (typeof runner !== 'function') {
      return { ok: false, reason: `runner not found for module: ${id}` };
    }

    const chatId = String(ctx?.chatId || S.chatId || UTIL_WS_getChatId() || STR_WS.unknown);
    const profile = API_WS_getChatProfile(chatId);
    const selection = ctx?.selection || API_WS_inspectSelectionContext();
    const pack = manifest?.packId ? API_WS_getPack(manifest.packId) : null;

    const runtimeCtx = {
      ...(ctx || {}),
      chatId,
      module: manifest,
      pack,
      profile,
      selection,
      helpers: {
        now: UTIL_WS_now,
        cryptoId: UTIL_WS_cryptoId,
        clone: UTIL_WS_clone,
        emit: UTIL_WS_emit,
      },
      api: {
        getChatProfile: () => API_WS_getChatProfile(chatId),
        saveChatProfile: (patch) => API_WS_saveChatProfile(patch, chatId),

        listArtifacts: (filter = {}) => API_WS_listArtifacts({ chatId, ...(filter || {}) }),
        getArtifact: (artifactId) => API_WS_getArtifact(artifactId, chatId),
        saveArtifact: (record) => API_WS_saveArtifact({
          ...(record || {}),
          chatId,
          packId: record?.packId || manifest?.packId || '',
          moduleId: record?.moduleId || id,
        }),
        updateArtifact: (artifactId, patch) => API_WS_updateArtifact(artifactId, patch, chatId),
        removeArtifact: (artifactId) => API_WS_removeArtifact(artifactId, chatId),

        inspectSelectionContext: API_WS_inspectSelectionContext,
        snapshotChatTurns: API_WS_snapshotChatTurns,
        getVisibleTurns: API_WS_getVisibleTurns,
        createPromptCapsule: (cfg) => API_WS_createPromptCapsule({
          ...(cfg || {}),
          packId: cfg?.packId || manifest?.packId || '',
          moduleId: cfg?.moduleId || id,
        }),
        markPromptCapsuleUsed: (capsuleId) => API_WS_markPromptCapsuleUsed(capsuleId, chatId),
        insertTextIntoComposer: API_WS_insertTextIntoComposer,
        upsertArtifacts: API_WS_upsertArtifacts,
        scoreExtractionCoverage: API_WS_scoreExtractionCoverage,

        openShelf: API_WS_openShelf,
        openDrawer: API_WS_openDrawer,
        closeRightShell: API_WS_closeRightShell,
        setRightMode: API_WS_setRightMode,
        getRightState: API_WS_getRightState,

        emit: UTIL_WS_emit,
      },
    };

    UTIL_WS_emit(EV_WS_MODULE_RUN_REQUEST, { moduleId: id, chatId });

    try {
      const result = await runner(runtimeCtx);
      const runAt = UTIL_WS_now();
      const nextRecentRuns = {
        ...((profile?.prefs?.recentModuleRuns && typeof profile.prefs.recentModuleRuns === 'object')
          ? profile.prefs.recentModuleRuns
          : {}),
        [id]: runAt,
      };
      API_WS_saveChatProfile({
        lastAnalyzedAt: runAt,
        prefs: {
          ...(profile?.prefs || {}),
          lastModuleId: id,
          recentModuleRuns: nextRecentRuns,
        },
      }, chatId);
      UTIL_WS_emit(EV_WS_MODULE_RUN_DONE, { moduleId: id, chatId, result: result || null });
      return { ok: true, moduleId: id, ...(result && typeof result === 'object' ? result : { result }) };
    } catch (err) {
      const msg = String(err?.stack || err || 'unknown error');
      UTIL_WS_emit(EV_WS_MODULE_RUN_FAILED, { moduleId: id, chatId, error: msg });
      DIAG_WS_safe('module:run:error', { moduleId: id, error: msg });
      return { ok: false, moduleId: id, reason: msg };
    }
  }

  function UTIL_WS_normText(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function UTIL_WS_countRegexHits(text, patterns = []) {
    const t = UTIL_WS_normText(text);
    let hits = 0;
    for (const re of patterns) {
      try {
        const m = t.match(re);
        if (m) hits += m.length || 1;
      } catch (_) {}
    }
    return hits;
  }

  function UTIL_WS_collectSuggestionSignals(chatId = S.chatId) {
    const profile = API_WS_getChatProfile(chatId);
    const turns = API_WS_snapshotChatTurns({ limit: 80 }) || [];
    const artifacts = API_WS_listArtifacts({ chatId }) || [];

    const titleText = String(profile?.title || '');
    const allText = [titleText, ...turns.map(t => String(t?.text || ''))].join('\n');

    const timelineHits = UTIL_WS_countRegexHits(allText, [
      /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b(before|after|then|later|earlier|first|second|third|timeline|chronology|chronological|event|incident)\b/g,
    ]);

    const claimHits = UTIL_WS_countRegexHits(allText, [
      /\b(refused|denied|rejected|failed|not accepted|not allowed|confirmed|accepted|approved|granted|allowed)\b/g,
      /\b(must|should|required|deadline|within|because|due to|since|therefore|reason)\b/g,
      /\b(claim|statement|decision|requirement|objection|explanation)\b/g,
    ]);

    const actorHits = UTIL_WS_countRegexHits(allText, [
      /\b(programme director|academic board|board|ombudsstelle|diversity office|dean|lecturer|professor|assistant|lawyer|student|office|university)\b/g,
      /\b(mr|mrs|ms|dr|prof)\.?\s+[a-z]/g,
    ]);

    const legalSignals = UTIL_WS_countRegexHits(allText, [
      /\b(legal|case|complaint|appeal|objection|evidence|deadline|decision|exam|university|board|director)\b/g,
    ]);

    const artifactCounts = artifacts.reduce((acc, x) => {
      const k = String(x?.type || 'artifact');
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, Object.create(null));

    return {
      profile,
      turns,
      artifacts,
      allText,
      timelineHits,
      claimHits,
      actorHits,
      legalSignals,
      artifactCounts,
    };
  }

  function UTIL_WS_pushSuggestion(out, {
    moduleId,
    score = 0,
    reason = '',
    nextAction = '',
    packId = '',
  } = {}) {
    if (!moduleId) return;

    const mod = API_WS_getModule(moduleId);
    if (!mod) return;

    out.push({
      moduleId,
      title: String(mod?.title || moduleId),
      icon: String(mod?.icon || '🧩'),
      packId: String(packId || mod?.packId || ''),
      score: Number(score.toFixed(2)),
      reason: String(reason || ''),
      nextAction: String(nextAction || ''),
    });
  }

  function UTIL_WS_getRecentModuleRuns(profile) {
    const raw = (profile?.prefs?.recentModuleRuns && typeof profile.prefs.recentModuleRuns === 'object')
      ? profile.prefs.recentModuleRuns
      : {};
    const out = Object.create(null);
    for (const [k, v] of Object.entries(raw)) {
      const ts = Number(v || 0);
      if (k && ts > 0) out[String(k)] = ts;
    }
    return out;
  }

  function UTIL_WS_filterRecentSuggestions(items, profile, now = UTIL_WS_now()) {
    const recentRuns = UTIL_WS_getRecentModuleRuns(profile);
    const maxAgeMs = 45 * 60 * 1000;
    return (Array.isArray(items) ? items : []).filter((item) => {
      const moduleId = String(item?.moduleId || '');
      const lastRunAt = Number(recentRuns[moduleId] || 0);
      return !(moduleId && lastRunAt && (now - lastRunAt) < maxAgeMs);
    });
  }

  function API_WS_suggestModulesForChat(chatId = S.chatId) {
    const signals = UTIL_WS_collectSuggestionSignals(chatId);
    const profile = signals.profile || {};
    const activePackIds = Array.isArray(profile?.activePackIds) ? profile.activePackIds : [];
    const primaryPackId = String(profile?.prefs?.primaryPackId || '');
    const isLegalContext =
      activePackIds.includes('legal') ||
      primaryPackId === 'legal' ||
      signals.legalSignals >= 2;

    const out = [];

    if (!isLegalContext) {
      DIAG_WS_safe('modules:suggest:none', { chatId, reason: 'no-strong-pack-signal' });
      return [];
    }

    const claimCount = Number(signals.artifactCounts?.legal_claim || 0);
    const actorCount = Number(signals.artifactCounts?.legal_actor || 0);
    const timelineCount = Number(signals.artifactCounts?.timeline_item || 0);
    const contradictionCount = Number(signals.artifactCounts?.legal_contradiction || 0);
    const capsuleCount = Number(signals.artifactCounts?.prompt_capsule || 0);

    let timelineScore = 0.25;
    if (signals.timelineHits >= 2) timelineScore += 0.35;
    if (timelineCount < 3) timelineScore += 0.18;
    if (capsuleCount > 0) timelineScore += 0.06;

    UTIL_WS_pushSuggestion(out, {
      moduleId: 'legal.timeline',
      score: timelineScore,
      packId: 'legal',
      reason:
        timelineCount < 3
          ? 'This chat appears to contain event/order signals, and timeline coverage is still light.'
          : 'This chat contains chronology signals; rerunning Timeline may improve ordering/coverage.',
      nextAction:
        capsuleCount > 0
          ? 'Review any prompt capsule, insert it into the composer if needed, then rerun Timeline.'
          : 'Run Timeline Builder to extract and organize incident chronology.',
    });

    if (API_WS_getModule('legal.claim_sweep')) {
      let claimSweepScore = 0.20;
      if (signals.claimHits >= 3) claimSweepScore += 0.42;
      if (claimCount < 6) claimSweepScore += 0.20;

      UTIL_WS_pushSuggestion(out, {
        moduleId: 'legal.claim_sweep',
        score: claimSweepScore,
        packId: 'legal',
        reason:
          claimCount < 6
            ? 'The chat contains many likely decision/requirement/reasoning phrases, but claim coverage is still incomplete.'
            : 'The chat still contains formal-claim language; another sweep may capture missed claims.',
        nextAction: 'Run Claim Sweep to extract claim-like statements across visible turns.',
      });
    } else {
      let claimLogScore = 0.18;
      if (signals.claimHits >= 2) claimLogScore += 0.34;
      if (claimCount < 3) claimLogScore += 0.12;

      UTIL_WS_pushSuggestion(out, {
        moduleId: 'legal.claim_log',
        score: claimLogScore,
        packId: 'legal',
        reason: 'Formal claims are present, but bulk claim sweep is not registered yet.',
        nextAction: 'Use Claim Log on the most important passages manually.',
      });
    }

    if (API_WS_getModule('legal.actor_sweep')) {
      let actorSweepScore = 0.18;
      if (signals.actorHits >= 2) actorSweepScore += 0.40;
      if (actorCount < 5) actorSweepScore += 0.20;

      UTIL_WS_pushSuggestion(out, {
        moduleId: 'legal.actor_sweep',
        score: actorSweepScore,
        packId: 'legal',
        reason:
          actorCount < 5
            ? 'The chat likely contains several people/offices/institutions, but actor coverage is still limited.'
            : 'There are still actor/institution signals in visible turns that may not be fully mapped.',
        nextAction: 'Run Actor Sweep to map people, offices, and institutions across the chat.',
      });
    } else {
      let actorMapScore = 0.15;
      if (signals.actorHits >= 1) actorMapScore += 0.30;
      if (actorCount < 2) actorMapScore += 0.10;

      UTIL_WS_pushSuggestion(out, {
        moduleId: 'legal.actor_map',
        score: actorMapScore,
        packId: 'legal',
        reason: 'Actor-related signals are present, but bulk actor sweep is not registered yet.',
        nextAction: 'Use Actor Map on the most important people/offices manually.',
      });
    }

    if (claimCount >= 2) {
      let contradictionScore = 0.14 + Math.min(0.40, claimCount * 0.05);
      if (contradictionCount === 0) contradictionScore += 0.08;
      if (signals.claimHits >= 3) contradictionScore += 0.05;

      UTIL_WS_pushSuggestion(out, {
        moduleId: 'legal.contradiction_pairer',
        score: contradictionScore,
        packId: 'legal',
        reason:
          contradictionCount === 0
            ? 'Enough claim artifacts exist to start contradiction checking.'
            : 'Existing claims can be checked again for newly emerged contradictions.',
        nextAction: 'Run Contradiction Pairer after claim extraction stabilizes.',
      });
    }

    const deduped = [];
    const seen = new Set();

    for (const item of out.sort((a, b) => b.score - a.score)) {
      if (seen.has(item.moduleId)) continue;
      seen.add(item.moduleId);
      deduped.push(item);
    }

    const filtered = UTIL_WS_filterRecentSuggestions(deduped, profile);

    DIAG_WS_safe('modules:suggest:ok', {
      chatId,
      count: filtered.length,
      top: filtered.slice(0, 4).map(x => ({ id: x.moduleId, score: x.score })),
    });

    return filtered.slice(0, 6);
  }

  /* ───────────────────────────── 10) Right Shell API (functional state only) ───────────────────────────── */

  function API_WS_getRightState() {
    return STORE_WS_loadShellState();
  }

  function API_WS_setRightState(partial) {
    const next = STORE_WS_saveShellState(partial || {});
    UTIL_WS_emit(EV_WS_RIGHT_SHELL_CHANGED, { state: next, reason: 'set' });
    return next;
  }

  function API_WS_openShelf() {
    return API_WS_setRightState({ open: true, pane: STR_WS.paneShelf });
  }

  function API_WS_openDrawer() {
    return API_WS_setRightState({ open: true, pane: STR_WS.paneDrawer });
  }

  function API_WS_closeRightShell() {
    return API_WS_setRightState({ open: false });
  }

  function API_WS_setRightMode(pane) {
    const nextPane = String(pane || '').trim();
    if (nextPane !== STR_WS.paneShelf && nextPane !== STR_WS.paneDrawer) return API_WS_getRightState();
    return API_WS_setRightState({ pane: nextPane });
  }

  function API_WS_setDockMode(mode) {
    const m = String(mode || '').trim();
    if (m !== STR_WS.modeDock && m !== STR_WS.modeOverlay) return API_WS_getRightState();
    return API_WS_setRightState({ dockMode: m });
  }

  function API_WS_saveShelfUi(partial) {
    return STORE_WS_saveShelfUi(partial || {});
  }

  function API_WS_saveDrawerUi(partial) {
    return STORE_WS_saveDrawerUi(partial || {});
  }

  /* ───────────────────────────── 11) Sync Adapter API (stubs on purpose) ───────────────────────────── */

  function API_WS_registerSyncAdapter(adapter) {
    const id = String(adapter?.id || '').trim();
    if (!id) return false;

    REG.syncAdapters[id] = {
      id,
      title: String(adapter?.title || id),
      version: String(adapter?.version || '0.0.0'),
      kind: String(adapter?.kind || 'custom'),
      push: (typeof adapter?.push === 'function') ? adapter.push : null,
      pull: (typeof adapter?.pull === 'function') ? adapter.pull : null,
      bind: (typeof adapter?.bind === 'function') ? adapter.bind : null,
    };

    UTIL_WS_lsSet(KEY_WS_REG_SYNC_ADAPTERS_V1, JSON.stringify(Object.keys(REG.syncAdapters)));
    return true;
  }

  function API_WS_listSyncAdapters() {
    return Object.values(REG.syncAdapters || {}).map(UTIL_WS_clone);
  }

  function API_WS_pushArtifacts({ adapterId, chatId = S.chatId, artifactIds = null } = {}) {
    // TODO:
    // - resolve adapter
    // - select artifacts
    // - call adapter.push(...)
    // - update sync metadata + dirty flags
    UTIL_WS_emit(EV_WS_SYNC_PUSH_DONE, { adapterId, chatId, artifactIds, stub: true });
    DIAG_WS_safe('sync:push:stub', { adapterId, chatId, artifactIds });
    return { ok: false, stub: true, reason: 'pushArtifacts not implemented yet' };
  }

  function API_WS_pullArtifacts({ adapterId, chatId = S.chatId } = {}) {
    // TODO:
    // - resolve adapter
    // - fetch remote items
    // - merge/import into local artifact store
    UTIL_WS_emit(EV_WS_SYNC_PULL_DONE, { adapterId, chatId, stub: true });
    DIAG_WS_safe('sync:pull:stub', { adapterId, chatId });
    return { ok: false, stub: true, reason: 'pullArtifacts not implemented yet' };
  }

  function API_WS_bindRemote({ adapterId, chatId = S.chatId, config = null } = {}) {
    // TODO:
    // - persist binding config for chat
    // - allow future auto push/pull
    DIAG_WS_safe('sync:bind:stub', { adapterId, chatId, config });
    return { ok: false, stub: true, reason: 'bindRemote not implemented yet' };
  }

  /* ───────────────────────────── 12) Simple event facade ───────────────────────────── */

  function API_WS_on(ev, fn, opts) {
    try { W.addEventListener(ev, fn, opts); return true; } catch { return false; }
  }

  function API_WS_off(ev, fn, opts) {
    try { W.removeEventListener(ev, fn, opts); return true; } catch { return false; }
  }

  function API_WS_emit(ev, detail) {
    UTIL_WS_emit(ev, detail);
    return true;
  }

  /* ───────────────────────────── 13) Public API + Contract export ───────────────────────────── */

  VAULT.api = VAULT.api || {};

  VAULT.api.getContract = VAULT.api.getContract || function getContract() {
    return Object.freeze({
      ident: Object.freeze({ TOK, PID, CID, SkID, SUITE, HOST, DsID, BrID, MODTAG, MODICON, EMOJI_HDR }),
      disk: Object.freeze({
        NS_DISK,
        KEY_WS_REG_PACKS_V1,
        KEY_WS_REG_MODULES_V1,
        KEY_WS_UI_RIGHT_SHELL_V1,
        KEY_WS_UI_SHELF_V1,
        KEY_WS_UI_DRAWER_V1,
        KEY_WS_LIB_INSTALLED_PACKS_V1,
        KEY_WS_LIB_CATALOG_CACHE_V1,
        KEY_WS_SYNC_QUEUE_V1,
        KEY_WS_SYNC_BINDINGS_V1,
        KEY_WS_MIG_STATE_V1,
      }),
      events: Object.freeze({
        EV_WS_READY,
        EV_WS_PACKS_CHANGED,
        EV_WS_MODULES_CHANGED,
        EV_WS_CHAT_PROFILE_CHANGED,
        EV_WS_ARTIFACTS_CHANGED,
        EV_WS_RIGHT_SHELL_CHANGED,
        EV_WS_MODULE_RUN_REQUEST,
        EV_WS_MODULE_RUN_DONE,
        EV_WS_MODULE_RUN_FAILED,
        EV_WS_SYNC_PUSH_DONE,
        EV_WS_SYNC_PULL_DONE,
      }),
      attr: Object.freeze({ ATTR_WS }),
      str: Object.freeze(STR_WS),
      cfg: Object.freeze(CFG_WS),
      helpers: Object.freeze({
        now: UTIL_WS_now,
        safeParseJSON: UTIL_WS_safeParseJSON,
        lsGet: UTIL_WS_lsGet,
        lsSet: UTIL_WS_lsSet,
        lsDel: UTIL_WS_lsDel,
        emit: UTIL_WS_emit,
        getChatId: UTIL_WS_getChatId,
        cryptoId: UTIL_WS_cryptoId,
        keyChatProfile: UTIL_WS_keyChatProfile,
        keyChatArtifacts: UTIL_WS_keyChatArtifacts,
        keyChatModuleState: UTIL_WS_keyChatModuleState,
        clone: UTIL_WS_clone,
      }),
      reg: Object.freeze({
        packs: () => API_WS_listPacks(),
        modules: () => API_WS_listModules(),
        syncAdapters: () => API_WS_listSyncAdapters(),
      }),
      state: Object.freeze({
        rightShell: API_WS_getRightState,
        shelfUi: STORE_WS_loadShelfUi,
        drawerUi: STORE_WS_loadDrawerUi,
      }),
      api: VAULT.api,
    });
  };

  VAULT.api.ready = VAULT.api.ready || function ready() {
    return !!S.booted;
  };

  // registries
  VAULT.api.registerPack = VAULT.api.registerPack || API_WS_registerPack;
  VAULT.api.unregisterPack = VAULT.api.unregisterPack || API_WS_unregisterPack;
  VAULT.api.getPack = VAULT.api.getPack || API_WS_getPack;
  VAULT.api.listPacks = VAULT.api.listPacks || API_WS_listPacks;

  VAULT.api.registerModule = VAULT.api.registerModule || API_WS_registerModule;
  VAULT.api.unregisterModule = VAULT.api.unregisterModule || API_WS_unregisterModule;
  VAULT.api.getModule = VAULT.api.getModule || API_WS_getModule;
  VAULT.api.listModules = VAULT.api.listModules || API_WS_listModules;
  VAULT.api.registerModuleRunner = VAULT.api.registerModuleRunner || API_WS_registerModuleRunner;
  VAULT.api.unregisterModuleRunner = VAULT.api.unregisterModuleRunner || API_WS_unregisterModuleRunner;

  // chat/profile
  VAULT.api.getChatProfile = VAULT.api.getChatProfile || API_WS_getChatProfile;
  VAULT.api.saveChatProfile = VAULT.api.saveChatProfile || API_WS_saveChatProfile;
  VAULT.api.bindChatProfile = VAULT.api.bindChatProfile || API_WS_bindChatProfile;
  VAULT.api.activatePack = VAULT.api.activatePack || API_WS_activatePack;
  VAULT.api.deactivatePack = VAULT.api.deactivatePack || API_WS_deactivatePack;
  VAULT.api.listActivePacks = VAULT.api.listActivePacks || API_WS_listActivePacks;
  VAULT.api.pinModule = VAULT.api.pinModule || API_WS_pinModule;
  VAULT.api.unpinModule = VAULT.api.unpinModule || API_WS_unpinModule;
  VAULT.api.listPinnedModules = VAULT.api.listPinnedModules || API_WS_listPinnedModules;

  // artifacts
  VAULT.api.listArtifacts = VAULT.api.listArtifacts || API_WS_listArtifacts;
  VAULT.api.getArtifact = VAULT.api.getArtifact || API_WS_getArtifact;
  VAULT.api.saveArtifact = VAULT.api.saveArtifact || API_WS_saveArtifact;
  VAULT.api.updateArtifact = VAULT.api.updateArtifact || API_WS_updateArtifact;
  VAULT.api.removeArtifact = VAULT.api.removeArtifact || API_WS_removeArtifact;
  VAULT.api.bulkSaveArtifacts = VAULT.api.bulkSaveArtifacts || API_WS_bulkSaveArtifacts;
  VAULT.api.clearArtifactsByType = VAULT.api.clearArtifactsByType || API_WS_clearArtifactsByType;
  VAULT.api.exportArtifactsJSON = VAULT.api.exportArtifactsJSON || API_WS_exportArtifactsJSON;

  // execution
  VAULT.api.runModule = VAULT.api.runModule || API_WS_runModule;
  VAULT.api.suggestModulesForChat = VAULT.api.suggestModulesForChat || API_WS_suggestModulesForChat;
  VAULT.api.inspectSelectionContext = VAULT.api.inspectSelectionContext || API_WS_inspectSelectionContext;
  VAULT.api.getVisibleTurns = VAULT.api.getVisibleTurns || API_WS_getVisibleTurns;
  VAULT.api.snapshotChatTurns = VAULT.api.snapshotChatTurns || API_WS_snapshotChatTurns;
  VAULT.api.createPromptCapsule = VAULT.api.createPromptCapsule || API_WS_createPromptCapsule;
  VAULT.api.markPromptCapsuleUsed = VAULT.api.markPromptCapsuleUsed || API_WS_markPromptCapsuleUsed;
  VAULT.api.insertTextIntoComposer = VAULT.api.insertTextIntoComposer || API_WS_insertTextIntoComposer;
  VAULT.api.upsertArtifacts = VAULT.api.upsertArtifacts || API_WS_upsertArtifacts;
  VAULT.api.scoreExtractionCoverage = VAULT.api.scoreExtractionCoverage || API_WS_scoreExtractionCoverage;

  // right shell
  VAULT.api.openShelf = VAULT.api.openShelf || API_WS_openShelf;
  VAULT.api.openDrawer = VAULT.api.openDrawer || API_WS_openDrawer;
  VAULT.api.closeRightShell = VAULT.api.closeRightShell || API_WS_closeRightShell;
  VAULT.api.setRightMode = VAULT.api.setRightMode || API_WS_setRightMode;
  VAULT.api.getRightState = VAULT.api.getRightState || API_WS_getRightState;
  VAULT.api.setDockMode = VAULT.api.setDockMode || API_WS_setDockMode;
  VAULT.api.saveShelfUi = VAULT.api.saveShelfUi || API_WS_saveShelfUi;
  VAULT.api.saveDrawerUi = VAULT.api.saveDrawerUi || API_WS_saveDrawerUi;

  // sync
  VAULT.api.registerSyncAdapter = VAULT.api.registerSyncAdapter || API_WS_registerSyncAdapter;
  VAULT.api.listSyncAdapters = VAULT.api.listSyncAdapters || API_WS_listSyncAdapters;
  VAULT.api.pushArtifacts = VAULT.api.pushArtifacts || API_WS_pushArtifacts;
  VAULT.api.pullArtifacts = VAULT.api.pullArtifacts || API_WS_pullArtifacts;
  VAULT.api.bindRemote = VAULT.api.bindRemote || API_WS_bindRemote;

  // events
  VAULT.api.on = VAULT.api.on || API_WS_on;
  VAULT.api.off = VAULT.api.off || API_WS_off;
  VAULT.api.emit = VAULT.api.emit || API_WS_emit;

  /* ───────────────────────────── 14) Public window façade ───────────────────────────── */

  H2O.Workspace = H2O.Workspace || {};
  H2O.Workspace.getContract = H2O.Workspace.getContract || VAULT.api.getContract;
  H2O.Workspace.ready = H2O.Workspace.ready || VAULT.api.ready;

  H2O.Workspace.registerPack = H2O.Workspace.registerPack || VAULT.api.registerPack;
  H2O.Workspace.unregisterPack = H2O.Workspace.unregisterPack || VAULT.api.unregisterPack;
  H2O.Workspace.getPack = H2O.Workspace.getPack || VAULT.api.getPack;
  H2O.Workspace.listPacks = H2O.Workspace.listPacks || VAULT.api.listPacks;

  H2O.Workspace.registerModule = H2O.Workspace.registerModule || VAULT.api.registerModule;
  H2O.Workspace.unregisterModule = H2O.Workspace.unregisterModule || VAULT.api.unregisterModule;
  H2O.Workspace.getModule = H2O.Workspace.getModule || VAULT.api.getModule;
  H2O.Workspace.listModules = H2O.Workspace.listModules || VAULT.api.listModules;
  H2O.Workspace.registerModuleRunner = H2O.Workspace.registerModuleRunner || VAULT.api.registerModuleRunner;
  H2O.Workspace.unregisterModuleRunner = H2O.Workspace.unregisterModuleRunner || VAULT.api.unregisterModuleRunner;

  H2O.Workspace.getChatProfile = H2O.Workspace.getChatProfile || VAULT.api.getChatProfile;
  H2O.Workspace.saveChatProfile = H2O.Workspace.saveChatProfile || VAULT.api.saveChatProfile;
  H2O.Workspace.bindChatProfile = H2O.Workspace.bindChatProfile || VAULT.api.bindChatProfile;
  H2O.Workspace.activatePack = H2O.Workspace.activatePack || VAULT.api.activatePack;
  H2O.Workspace.deactivatePack = H2O.Workspace.deactivatePack || VAULT.api.deactivatePack;
  H2O.Workspace.listActivePacks = H2O.Workspace.listActivePacks || VAULT.api.listActivePacks;
  H2O.Workspace.pinModule = H2O.Workspace.pinModule || VAULT.api.pinModule;
  H2O.Workspace.unpinModule = H2O.Workspace.unpinModule || VAULT.api.unpinModule;
  H2O.Workspace.listPinnedModules = H2O.Workspace.listPinnedModules || VAULT.api.listPinnedModules;

  H2O.Workspace.listArtifacts = H2O.Workspace.listArtifacts || VAULT.api.listArtifacts;
  H2O.Workspace.getArtifact = H2O.Workspace.getArtifact || VAULT.api.getArtifact;
  H2O.Workspace.saveArtifact = H2O.Workspace.saveArtifact || VAULT.api.saveArtifact;
  H2O.Workspace.updateArtifact = H2O.Workspace.updateArtifact || VAULT.api.updateArtifact;
  H2O.Workspace.removeArtifact = H2O.Workspace.removeArtifact || VAULT.api.removeArtifact;
  H2O.Workspace.bulkSaveArtifacts = H2O.Workspace.bulkSaveArtifacts || VAULT.api.bulkSaveArtifacts;
  H2O.Workspace.clearArtifactsByType = H2O.Workspace.clearArtifactsByType || VAULT.api.clearArtifactsByType;
  H2O.Workspace.exportArtifactsJSON = H2O.Workspace.exportArtifactsJSON || VAULT.api.exportArtifactsJSON;

  H2O.Workspace.runModule = H2O.Workspace.runModule || VAULT.api.runModule;
  H2O.Workspace.suggestModulesForChat = H2O.Workspace.suggestModulesForChat || VAULT.api.suggestModulesForChat;
  H2O.Workspace.inspectSelectionContext = H2O.Workspace.inspectSelectionContext || VAULT.api.inspectSelectionContext;
  H2O.Workspace.getVisibleTurns = H2O.Workspace.getVisibleTurns || VAULT.api.getVisibleTurns;
  H2O.Workspace.snapshotChatTurns = H2O.Workspace.snapshotChatTurns || VAULT.api.snapshotChatTurns;
  H2O.Workspace.createPromptCapsule = H2O.Workspace.createPromptCapsule || VAULT.api.createPromptCapsule;
  H2O.Workspace.markPromptCapsuleUsed = H2O.Workspace.markPromptCapsuleUsed || VAULT.api.markPromptCapsuleUsed;
  H2O.Workspace.insertTextIntoComposer = H2O.Workspace.insertTextIntoComposer || VAULT.api.insertTextIntoComposer;
  H2O.Workspace.upsertArtifacts = H2O.Workspace.upsertArtifacts || VAULT.api.upsertArtifacts;
  H2O.Workspace.scoreExtractionCoverage = H2O.Workspace.scoreExtractionCoverage || VAULT.api.scoreExtractionCoverage;

  H2O.Workspace.openShelf = H2O.Workspace.openShelf || VAULT.api.openShelf;
  H2O.Workspace.openDrawer = H2O.Workspace.openDrawer || VAULT.api.openDrawer;
  H2O.Workspace.closeRightShell = H2O.Workspace.closeRightShell || VAULT.api.closeRightShell;
  H2O.Workspace.setRightMode = H2O.Workspace.setRightMode || VAULT.api.setRightMode;
  H2O.Workspace.getRightState = H2O.Workspace.getRightState || VAULT.api.getRightState;
  H2O.Workspace.setDockMode = H2O.Workspace.setDockMode || VAULT.api.setDockMode;
  H2O.Workspace.saveShelfUi = H2O.Workspace.saveShelfUi || VAULT.api.saveShelfUi;
  H2O.Workspace.saveDrawerUi = H2O.Workspace.saveDrawerUi || VAULT.api.saveDrawerUi;

  H2O.Workspace.registerSyncAdapter = H2O.Workspace.registerSyncAdapter || VAULT.api.registerSyncAdapter;
  H2O.Workspace.listSyncAdapters = H2O.Workspace.listSyncAdapters || VAULT.api.listSyncAdapters;
  H2O.Workspace.pushArtifacts = H2O.Workspace.pushArtifacts || VAULT.api.pushArtifacts;
  H2O.Workspace.pullArtifacts = H2O.Workspace.pullArtifacts || VAULT.api.pullArtifacts;
  H2O.Workspace.bindRemote = H2O.Workspace.bindRemote || VAULT.api.bindRemote;

  H2O.Workspace.on = H2O.Workspace.on || VAULT.api.on;
  H2O.Workspace.off = H2O.Workspace.off || VAULT.api.off;
  H2O.Workspace.emit = H2O.Workspace.emit || VAULT.api.emit;

  /* ───────────────────────────── 15) Boot / rebind / hydrate ───────────────────────────── */

  function CORE_WS_rebindIfChatChanged() {
    const now = UTIL_WS_getChatId();
    if (now === S.chatId) return;
    S.chatId = now;
    API_WS_saveChatProfile({ lastOpenedAt: UTIL_WS_now() }, now);
    UTIL_WS_emit(EV_WS_CHAT_PROFILE_CHANGED, { chatId: now, reason: 'rebind' });
    DIAG_WS_safe('chat:rebind', { chatId: now });
  }

  function CORE_WS_bindNav() {
    if (W[KEY_WS_GUARD_NAV]) return;
    W[KEY_WS_GUARD_NAV] = 1;

    S.onPop = () => CORE_WS_rebindIfChatChanged();
    W.addEventListener('popstate', S.onPop);

    if (W[KEY_WS_GUARD_MO]) return;
    W[KEY_WS_GUARD_MO] = 1;

    if (typeof MutationObserver !== 'function') return;
    S.mo = new MutationObserver(() => CORE_WS_rebindIfChatChanged());
    S.mo.observe(D.documentElement, { childList: true, subtree: CFG_WS.moObserveSubtree });
  }

  function CORE_WS_installCrashHooksOnce() {
    const k = `${NS_MEM_ONCE}:crash`;
    if (W[k]) return;
    W[k] = 1;

    const onError = (e) => DIAG_WS_safe('window:error', { msg: e?.message, file: e?.filename, line: e?.lineno, col: e?.colno });
    const onRej = (e) => DIAG_WS_safe('window:unhandledrejection', String(e?.reason?.stack || e?.reason || 'unknown'));

    S.handlers.onError = onError;
    S.handlers.onRejection = onRej;

    W.addEventListener('error', onError, true);
    W.addEventListener('unhandledrejection', onRej, true);
  }

  function CORE_WS_hydrateRegistries() {
    REG.packs = STORE_WS_loadPackRegistryDisk();
    REG.modules = STORE_WS_loadModuleRegistryDisk();
  }

  function CORE_WS_boot() {
    if (S.booted || W[KEY_WS_GUARD_BOOT]) return;
    S.booted = true;
    W[KEY_WS_GUARD_BOOT] = 1;

    VAULT.diag.bootCount += 1;
    VAULT.diag.lastBootAt = UTIL_WS_now();

    S.chatId = UTIL_WS_getChatId();
    CORE_WS_hydrateRegistries();
    CORE_WS_installCrashHooksOnce();
    CORE_WS_bindNav();

    API_WS_saveChatProfile({ lastOpenedAt: UTIL_WS_now() }, S.chatId);
    UTIL_WS_emit(EV_WS_READY, { chatId: S.chatId });
    DIAG_WS_safe('boot:ok', { chatId: S.chatId });
  }

  CORE_WS_boot();
})();
