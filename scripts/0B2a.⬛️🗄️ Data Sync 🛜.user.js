// ==UserScript==
// @h2o-id             0b2a.data.sync
// @name               0B2a.⬛️🗄️ Data Sync 🛜
// @namespace          H2O.Premium.CGX.data.sync
// @author             HumamDev
// @version            1.3.2
// @revision           001
// @build              260304-102754
// @description        H2O Sync: WebDAV + LiveSync runtime + legacy shim. Split-safe; attaches to H2O Data Core.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              unsafeWindow
// ==/UserScript==


(() => {
  'use strict';

  const VERSION = '1.2.6-sync.4';

  // Page bridge
  const W_PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W_PAGE.document;
  const W = W_PAGE;
  const TOPW = W_PAGE.top || W_PAGE;

  // Identity (separate bucket to avoid stomping Core DIAG/state)
  const TOK = 'HS';
  const PID = 'h2osync';
  const CID = 'HSync';
  const SkID = 'h2sy';

  const MODTAG = 'HSync';
  const MODICON = '🛜';
  const EMOJI_HDR = '⬛️🛜';
  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;
  const CID_UP = CID.toUpperCase();

  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;
  H2O[TOK] = H2O[TOK] || {};
  const MOD_OBJ = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, cid: CID_UP, skid: SkID,
    modtag: MODTAG, modicon: MODICON, emoji: EMOJI_HDR, suite: SUITE, host: HOST,
    version: VERSION,
  };
  try { MOD_OBJ.meta.version = VERSION; } catch {}

  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  H2O.EV   = H2O.EV   || {};
  H2O.KEYS = H2O.KEYS || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  // Get Core namespaces if available (must match Core disk keys)
  const CORE_NS = (H2O.data?.ready?.ns) || null;
  const NS_DISK = CORE_NS?.NS_DISK || `h2o:${SUITE}:${HOST}:h2odata`;
  const NS_EV   = CORE_NS?.NS_EV   || `h2o.ev:${SUITE}:${HOST}:h2odata`;

  function UTIL_capPush(arr, item, max) {
    try { arr.push(item); if (arr.length > max) arr.splice(0, arr.length - max); } catch {}
  }
  function DIAG_step(msg, extra) {
    UTIL_capPush(DIAG.steps, { t: Math.round(performance.now() - DIAG.t0), msg, extra: extra ? String(extra) : undefined }, DIAG.bufMax);
  }
  function DIAG_err(msg, err) {
    UTIL_capPush(DIAG.errors, { t: Math.round(performance.now() - DIAG.t0), msg, err: String(err?.stack || err || '') }, DIAG.errMax);
  }
  function SAFE_call(label, fn) {
    try { return fn(); } catch (e) { DIAG_err(label, e); return undefined; }
  }

  // Storage wrapper (needed for Live meta writes even when bypassing Core store wrappers)
  const UTIL_storage = {
    getStr(key, fallback = null) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    setStr(key, val) {
      try { localStorage.setItem(key, String(val)); return true; } catch { return false; }
    },
    del(key) {
      try { localStorage.removeItem(key); return true; } catch { return false; }
    },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
    },
    keys() {
      try { return Object.keys(localStorage); } catch { return []; }
    },
  };

  // Event emitter uses Core bus/dom
  function EV_emit(topic, detail = {}) {
    const emitTarget = H2O.events?.emit || H2O.bus?.emit;
    if (emitTarget) return SAFE_call('emit(bus)', () => emitTarget(topic, detail));
    return SAFE_call('emit(dom)', () => W.dispatchEvent(new CustomEvent(topic, { detail })));
  }

  // Cleanup (idempotent)
  const CLEAN = [];
  function CLEAN_add(fn) { if (typeof fn === 'function') CLEAN.push(fn); }
  function CLEAN_runAll() {
    for (let i = CLEAN.length - 1; i >= 0; i--) { try { CLEAN[i](); } catch (e) { DIAG_err('cleanup', e); } }
    CLEAN.length = 0;
  }

  // Pull Core services (hard dependency for push/pull bundles)
  const store  = H2O.store;
  const backup = H2O.backup;

  // Split handshake: wait for Core if needed (no deadlocks)
  const EV_DATA_READY = H2O.EV['HD_READY'] || 'evt:h2o:data:ready';
  const EV_SYNC_WEBDAV_CHANGED =
    H2O.EV['HD_SYNC_WEBDAV_CHANGED'] ||
    H2O.EV['SYNC_WEBDAV_CHANGED'] ||
    'evt:h2o:sync:webdav:changed';
  H2O.EV['HD_SYNC_WEBDAV_CHANGED'] = H2O.EV['HD_SYNC_WEBDAV_CHANGED'] || EV_SYNC_WEBDAV_CHANGED;
  H2O.EV['SYNC_WEBDAV_CHANGED'] = H2O.EV['SYNC_WEBDAV_CHANGED'] || EV_SYNC_WEBDAV_CHANGED;

  function WAIT_forCore(cb) {
    if (H2O?.store && H2O?.backup && H2O?.data?.ready?.ok) return cb();
    const onReady = () => { try { W.removeEventListener(EV_DATA_READY, onReady); } catch {} cb(); };
    try { W.addEventListener(EV_DATA_READY, onReady); CLEAN_add(() => { try { W.removeEventListener(EV_DATA_READY, onReady); } catch {} }); } catch {}
    // best-effort fallback: one microtask + a delayed check (keeps UI smooth)
    Promise.resolve().then(() => { if (H2O?.store && H2O?.backup) onReady(); });
    W.setTimeout(() => { if (H2O?.store && H2O?.backup) onReady(); }, 250);
  }

  // ───────────────────────────── 🧩 Split bridge: batched store-change emit (Core owns STORE_emitChange) ─────────────────────────────
  const EV_DATA_STORE_CHANGED = H2O.EV['HD_STORE_CHANGED'] || 'evt:h2o:data:store:changed';
  const STORE_emitChange = (reason, keys = []) => {
    try {
      const fn = H2O.data?._emitStoreChange;
      if (typeof fn === 'function') return fn(reason, keys);
    } catch {}
    // fallback (should rarely be needed)
    return EV_emit(EV_DATA_STORE_CHANGED, { reason, keys: Array.isArray(keys) ? keys.slice() : [] });
  };

/* ───────────────────────────── ⬜️ 8) SYNC (unified) + Legacy WebDAV shim ───────────────────────────── */

  const sync = (H2O.sync = H2O.sync || {});
  sync.metaVersion = sync.metaVersion || VERSION;

  const SYNC_KEY_TARGET = `${NS_DISK}:sync:target:v1`;
  const SYNC_KEY_CREDS  = `${NS_DISK}:sync:webdav:creds:v1`;
  const SYNC_KEY_LAST   = `${NS_DISK}:sync:last:v1`;

  const SYNC_DEFAULT_ROOT = 'H2O';
  const SYNC_FILE_BACKUP  = 'h2o-backup.json';
  const SYNC_FILE_VAULT   = 'h2o-vault.json';
  const SYNC_FILE_LIVE    = 'h2o-live.json';

  // 🧷 Pattern mismatch hardening (safe baseline):
  // These patterns are always kept so pattern adoption/merging can never
  // accidentally drop core MiniMap state (incl. wash map) and silently break sync.
  // Keep this list SMALL and strictly “must-have”.
  const LIVE_REQUIRED_PATTERNS = [
    'h2o:prm:cgx:mnmp:state:',
    'h2o:prm:cgx:mnmp:ui:behavior-map:v1',
  ];


  function SYNC_nowIso() { return new Date().toISOString(); }

  async function SYNC_sha256(str) {
    try {
      const enc = new TextEncoder();
      const buf = enc.encode(String(str || ''));
      const dig = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(dig)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      let h = 0;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i), h |= 0;
      return `weak:${Math.abs(h)}`;
    }
  }

  function SYNC_normUrl(u) {
    let url = String(u || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\s+/g, '');
    url = url.replace(/\/+$/g, '');
    return url;
  }

  function SYNC_joinUrl(base, ...parts) {
    const b = SYNC_normUrl(base);
    const clean = parts
      .filter(Boolean)
      .map(p => String(p).trim())
      .map(p => p.replace(/^\/+/, '').replace(/\/+$/,''));
    const tail = clean.length ? '/' + clean.join('/') : '';
    return b + tail;
  }


  // -----------------------------------------------------------------------------
  // Safe JSON serialization
  // Some chats accumulate **thousands** of h2o:* keys. In certain engines,
  // JSON.stringify() over a huge array can throw:
  //   RangeError: Maximum call stack size exceeded
  // Our backup/vault bundles are simple (k,v strings), so serialize iteratively.
  function SYNC_serializePayload(payload) {
    const sch = payload && payload.schema;
    const items = payload && payload.items;
    const isBundle = (sch === 'H2O.backup.v1' || sch === 'H2O.vault.v1') && Array.isArray(items);
    if (!isBundle) return JSON.stringify(payload);

    let out = '{';
    out += '\"schema\":' + JSON.stringify(String(payload.schema || ''));
    out += ',\"createdAt\":' + JSON.stringify(String(payload.createdAt || ''));
    out += ',\"items\":[';
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      if (i) out += ',';
      out += '{\"k\":' + JSON.stringify(String(it.k || ''));
      out += ',\"v\":' + JSON.stringify(it.v == null ? '' : String(it.v));
      out += '}';
    }
    out += ']';
    out += '}';
    return out;
  }



  function SYNC_asCollectionUrl(u) {
    const s = String(u || '');
    if (!s) return s;
    return s.endsWith('/') ? s : (s + '/');
  }

  function SYNC_pickFinalUrl(r, fallback) {
    // Tampermonkey uses `finalUrl`; some engines provide `responseURL`.
    const fu = r && (r.finalUrl || r.responseURL);
    if (!fu) return fallback;
    return SYNC_asCollectionUrl(SYNC_normUrl(fu));
  }



  function SYNC_parseUrl(url) {
    try {
      const u = new URL(SYNC_normUrl(url));
      return { server: u.hostname, port: Number(u.port || (u.protocol === 'http:' ? 80 : 443)), protocol: u.protocol, pathname: u.pathname };
    } catch {
      return { server: '', port: 443, protocol: 'https:', pathname: '/' };
    }
  }

  function SYNC_loadTarget() { return store.getJSON(SYNC_KEY_TARGET, null); }
  function SYNC_saveTarget(t) { store.setJSON(SYNC_KEY_TARGET, t); return t; }

  function SYNC_loadCreds() {
    const c = store.getJSON(SYNC_KEY_CREDS, null);
    if (!c) return null;

    const url = c.url || c.baseUrl || '';
    const username = c.username || c.user || '';
    const password = c.password || c.pass || '';
    const root = c.root || c.folder || SYNC_DEFAULT_ROOT;

    const parsed = SYNC_parseUrl(url);
    const server = c.server || parsed.server;
    const port = Number(c.port || parsed.port || 443);

    const rememberPassword = !!c.rememberPassword || !!c.rememberPass || !!c.remember;

    return {
      url: SYNC_normUrl(url),
      server,
      port,
      root: String(root || SYNC_DEFAULT_ROOT).trim() || SYNC_DEFAULT_ROOT,
      username: String(username || '').trim(),
      password: String(password || ''),
      rememberPassword,
      savedAt: c.savedAt || null,
      lastTestAt: c.lastTestAt || null,
      lastTestOk: !!c.lastTestOk,
      lastErr: c.lastErr || null,
    };
  }

  function SYNC_saveCreds(creds) {
    if (!creds) { store.del(SYNC_KEY_CREDS); return null; }

    const safe = {
      schema: 'H2O.sync.webdav.creds.v1',
      savedAt: SYNC_nowIso(),
      url: SYNC_normUrl(creds.url || creds.baseUrl),
      server: String(creds.server || '').trim(),
      port: Number(creds.port || 443),
      root: String(creds.root || creds.folder || SYNC_DEFAULT_ROOT).trim() || SYNC_DEFAULT_ROOT,
      username: String(creds.username || creds.user || '').trim(),
      // If user asked to remember but password is empty, DON'T wipe the session password.
      // Remembering only makes sense when a real password is provided.
      rememberPassword: !!(creds.rememberPassword || creds.remember) && String(creds.password || creds.pass || '').length > 0,
      password: ((creds.rememberPassword || creds.remember) && String(creds.password || creds.pass || '').length > 0)
        ? String(creds.password || creds.pass || '')
        : '',
      lastTestAt: creds.lastTestAt || null,
      lastTestOk: !!creds.lastTestOk,
      lastErr: creds.lastErr || null,
    };

    const wrote = store.setJSON(SYNC_KEY_CREDS, safe);
    if (!wrote) return null;

    // If not remembered, keep session password (tab-only)
    try {
      if (!safe.rememberPassword && (creds.password || creds.pass)) {
        sessionStorage.setItem(`${SYNC_KEY_CREDS}:sessionPass`, String(creds.password || creds.pass || ''));
      }
      if (safe.rememberPassword) sessionStorage.removeItem(`${SYNC_KEY_CREDS}:sessionPass`);
    } catch {}

    EV_emit(EV_SYNC_WEBDAV_CHANGED, { linked: SYNC_isLinkedState(safe), url: safe.url, root: safe.root, username: safe.username });
    return safe;
  }

  function SYNC_getPassword(creds) {
    if (!creds) return '';
    if (creds.rememberPassword && creds.password) return creds.password;
    try { return sessionStorage.getItem(`${SYNC_KEY_CREDS}:sessionPass`) || ''; } catch { return ''; }
  }

  function SYNC_hasUsableCreds(creds) {
    if (!creds) return false;
    const url = String(creds.url || creds.baseUrl || '').trim();
    const user = String(creds.username || creds.user || '').trim();
    const pass = String(SYNC_getPassword(creds) || '').trim();
    return !!(url && user && pass);
  }

  function SYNC_isLinkedState(creds) {
    return !!(SYNC_hasUsableCreds(creds) && creds.lastTestOk === true);
  }

  function SYNC_loadLast() {
    return store.getJSON(SYNC_KEY_LAST, {
      schema: 'H2O.sync.last.v1',
      backup: { push: null, pull: null, remoteHash: null, conflict: null },
      vault:  { push: null, pull: null, remoteHash: null, conflict: null },
      live:   { push: null, pull: null, remoteHash: null, conflict: null, enabled: false, polling: false },
    });
  }
  function SYNC_saveLast(obj) { store.setJSON(SYNC_KEY_LAST, obj); return obj; }

  /* ───────────────────────────── 🧭 SYNC LOGIC MAP (labels) ─────────────────────────────
   *
   * [A] Normal single-device edits → push debounced ✅
   *     - Source: EV_DATA_STORE_CHANGED → LIVE_onStoreChangedEvent() → sync.live.pulse()
   *     - Debounce: LIVE_tryAutoPush() uses cfg.debounceMs
   *
   * [B] Other device sees edits → hash changes → pull overwrite ✅
   *     - Poll: sync.live.start() interval → SYNC_getRemoteHash() → if changed → sync.pullLive()
   *
   * [C] Avoid stale pulls (cached WebDAV/CDN) ✅
   *     - WEBDAV_getJson() adds cache-buster query + no-cache headers
   *
   * [D] Avoid ping-pong (pull/apply shouldn’t trigger push) ✅
   *     - LIVE_applyPayload() emits STORE_emitChange('apply', keys)
   *     - LIVE_onStoreChangedEvent() ignores reason==='apply'
   *     - LIVE_REMOTE_APPLY_GUARD also blocks meta tracking during remote writes
   *
   * [E] Bulk apply is efficient ✅
   *     - BULK_APPLY_MODE collapses N per-key change events into ONE store-changed event
   *
   * [F] True Concurrency ✅
   *     - Per-key meta map: { key -> {dev,seq} } using Lamport-style seq (no clock reliance)
   *     - Apply rule: newer meta wins; losing VALUE saved into conflicts log (optional)
   *
   * [G] Pattern mismatch ✅
   *     - If enforcePatterns=true, remote bundle patterns are adopted locally to prevent drift
   *
   * ────────────────────────────────────────────────────────────────────────────────
   */
  // ───────────────────────────── 🧬 8.1A) LIVE META (per-key concurrency guard) ─────────────────────────────
  // Goal: prevent true concurrency loss by tracking a monotonically increasing per-device sequence for each key.
  // - Values remain unchanged.
  // - Meta is stored separately and synced via Live channel.
  // - Decision rule: newer(seq) wins; if equal seq, devId tie-breaker (stable).
  const SYNC_KEY_LIVE_DEV_ID = `${NS_DISK}:sync:live:dev_id:v1`;
  const SYNC_KEY_LIVE_SEQ    = `${NS_DISK}:sync:live:seq:v1`;
  const SYNC_KEY_LIVE_META   = `${NS_DISK}:sync:live:meta:v1`;
  const SYNC_KEY_LIVE_CONFLICTS = `${NS_DISK}:sync:live:conflicts:v1`;

  let LIVE_DEV_ID = null;
  let LIVE_SEQ    = null;
  let LIVE_META_GUARD = 0;
  let LIVE_REMOTE_APPLY_GUARD = 0;
  let LIVE_NATIVE_HOOKS_INSTALLED = 0;
  let LIVE_ENABLED_CACHE = 0;

  function LIVE_getDevId() {
    if (LIVE_DEV_ID) return LIVE_DEV_ID;
    const existing = store.getRaw(SYNC_KEY_LIVE_DEV_ID, '') || '';
    if (existing) { LIVE_DEV_ID = String(existing); return LIVE_DEV_ID; }
    // Stable random id (persisted). Not user-facing.
    const rnd = (crypto?.randomUUID?.() || (Math.random().toString(16).slice(2) + Date.now().toString(16)));
    LIVE_DEV_ID = `dev_${rnd}`;
    try { UTIL_storage.setStr(SYNC_KEY_LIVE_DEV_ID, LIVE_DEV_ID); } catch {}
    return LIVE_DEV_ID;
  }

  function LIVE_getSeq() {
    if (typeof LIVE_SEQ === 'number' && isFinite(LIVE_SEQ)) return LIVE_SEQ;
    const s = store.getRaw(SYNC_KEY_LIVE_SEQ, '0');
    const n = Number(s || 0);
    LIVE_SEQ = isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    return LIVE_SEQ;
  }

  function LIVE_bumpSeq() {
    const n = LIVE_getSeq() + 1;
    LIVE_SEQ = n;
    try { UTIL_storage.setStr(SYNC_KEY_LIVE_SEQ, String(n)); } catch {}
    return n;
  }

  function LIVE_loadMeta() {
    const m = store.getJSON(SYNC_KEY_LIVE_META, Object.create(null));
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : Object.create(null);
  }

  function LIVE_saveMeta(metaObj) {
    // Use raw storage to avoid recursive write tracking.
    try {
      LIVE_META_GUARD = 1;
      UTIL_storage.setJSON(SYNC_KEY_LIVE_META, metaObj && typeof metaObj === 'object' ? metaObj : Object.create(null));
      return true;
    } catch {
      return false;
    } finally {
      LIVE_META_GUARD = 0;
    }
  }

  function LIVE_isMetaKey(k) {
    return k === SYNC_KEY_LIVE_META || k === SYNC_KEY_LIVE_DEV_ID || k === SYNC_KEY_LIVE_SEQ || k === SYNC_KEY_LIVE_CONFLICTS;
  }
  function LIVE_isInternalSyncKey(k) {
    const s = String(k || '');
    return !!s && s.startsWith(`${NS_DISK}:sync:`);
  }

  function LIVE_metaIsNewer(a, b) {
    // a newer than b ?
    const as = Number(a?.seq || 0);
    const bs = Number(b?.seq || 0);
    if (as > bs) return true;
    if (as < bs) return false;
    const ad = String(a?.dev || '');
    const bd = String(b?.dev || '');
    return ad > bd; // stable tie-break (lexicographic)
  }

  function LIVE_recordConflict(entry) {
    // ✅ Optional Conflict Saver (True Concurrency safety net)
    // When BOTH devices edited the same key, we deterministically pick a winner (meta LWW),
    // but we ALSO store the losing VALUE here so you can recover it later.
    //
    // Key:  h2o:prm:cgx:h2odata:sync:live:conflicts:v1
    // Shape (newest first):
    //   { at, key, winner:{dev,seq}, loser:{dev,seq}, loserSide:'local'|'remote', localVal, remoteVal }
    try {
      const arr = store.getJSON(SYNC_KEY_LIVE_CONFLICTS, []) || [];
      const next = Array.isArray(arr) ? arr : [];
      const e = entry && typeof entry === 'object' ? entry : {};
      next.unshift({
        at: SYNC_nowIso(),
        key: String(e.key || ''),
        winner: e.winner || null,
        loser: e.loser || null,
        loserSide: e.loserSide || null,
        localVal: (e.localVal !== undefined ? e.localVal : null),
        remoteVal: (e.remoteVal !== undefined ? e.remoteVal : null),
      });
      // clamp
      if (next.length > 80) next.length = 80;
      UTIL_storage.setJSON(SYNC_KEY_LIVE_CONFLICTS, next);
    } catch {}
  }

  // Called by store.setRaw/setJSON/del AFTER the write succeeds.
  // Decides if the key is Live-tracked and, if so, updates meta[k] = {dev, seq}.
  function LIVE_trackLocalWrite(key, why) {
    try {
      const k = String(key || '');
      if (!k) return;
      if (LIVE_META_GUARD) return;
      if (LIVE_isMetaKey(k)) return;
      if (LIVE_isInternalSyncKey(k)) return;
      if (LIVE_REMOTE_APPLY_GUARD) return;

      const cfg = LIVE_loadCfg();
      if (!cfg?.enabled) return;

      // Only track keys that match current live patterns.
      const pats = (cfg?.patterns || []).map(String);
      if (!pats.length) return;
      if (!pats.some(p => k.startsWith(p))) return;

      const dev = LIVE_getDevId();
      const seq = LIVE_bumpSeq();
      const meta = LIVE_loadMeta();
      meta[k] = { dev, seq, at: SYNC_nowIso(), why: String(why || '') };
      LIVE_saveMeta(meta);
    } catch {}
  }

  // Install native localStorage hooks so *all* writers (even those bypassing H2O.store)
  // participate in Live meta updates. This prevents a key from changing without its meta
  // bumping (which would make another device's older value "win" and revert your UI).
  function LIVE_installNativeStorageHooksOnce() {
    try {
      if (LIVE_NATIVE_HOOKS_INSTALLED) return;
      LIVE_NATIVE_HOOKS_INSTALLED = 1;

      const SP = (typeof Storage !== 'undefined') ? Storage.prototype : null;
      if (!SP || typeof SP.setItem !== 'function' || typeof SP.removeItem !== 'function') return;

      const _setItem = SP.setItem;
      const _removeItem = SP.removeItem;

      SP.setItem = function(k, v) {
        try {
          const key = String(k || '');
          if (LIVE_ENABLED_CACHE && !LIVE_REMOTE_APPLY_GUARD && !LIVE_isInternalSyncKey(key)) {
            LIVE_trackLocalWrite(key, 'native.setItem');
            // If a writer bypasses H2O.store (direct localStorage.setItem), still trigger Live.
            // Debounced push; guarded to avoid remote-apply loops.
            LIVE_tryAutoPush({ reason: 'native', key, source: 'native.setItem' }, false);
          }
        } catch {}
        return _setItem.call(this, k, v);
      };

      SP.removeItem = function(k) {
        try {
          const key = String(k || '');
          if (LIVE_ENABLED_CACHE && !LIVE_REMOTE_APPLY_GUARD && !LIVE_isInternalSyncKey(key)) {
            LIVE_trackLocalWrite(key, 'native.removeItem');
            LIVE_tryAutoPush({ reason: 'native', key, source: 'native.removeItem' }, false);
          }
        } catch {}
        return _removeItem.call(this, k);
      };
    } catch {}
  }

  /* ───────────────────────────── 🟧 8.1) LIVE SYNC (near-realtime) ─────────────────────────────
   * WebDAV has no server push, so "instant" = auto-push (debounced) + auto-pull (polling).
   * This channel syncs *only selected keys* (domain-level), not full backup.
   */

  const EV_DATA_LIVE_CHANGED = 'evt:h2o:data:liveChanged';
  const EV_DATA_LIVE_STATUS  = 'evt:h2o:data:liveStatus';
  const SYNC_KEY_LIVE_CFG    = `${NS_DISK}:sync:live:cfg:v1`;

const SYNC_KEY_LIVE_PAT_SIG = `${NS_DISK}:sync:live:patterns_sig:v1`;

  // ───────────────────────────── 🧷 8.1B) PATTERN HARDENING (cross-device consistency) ─────────────────────────────
  // Goal: prevent "pattern drift" between systems (sys1 watching prefixes that sys2 doesn't, causing silent partial sync).
  // Strategy:
  //   1) Normalize patterns (trim, drop empties, de-dup).
  //   2) Canonicalize order (sort) so two systems compare equal even if UI reordered.
  //   3) Optionally adopt remote patterns when enforcePatterns=true (already in LIVE_applyPayload).
  // Note: patterns are PREFIXES. Matching uses startsWith(prefix).
  function LIVE_normPatterns(pats, fallback = []) {
    const arr = Array.isArray(pats) ? pats : (pats ? [pats] : []);
    const out = [];
    const seen = new Set();
    for (const x of arr) {
      const s = String(x || '').trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    // Canonicalize order (prevents false mismatches due to reordering)
    out.sort();
    if (!out.length) {
      const fb = Array.isArray(fallback) ? fallback : [];
      if (fb.length) return LIVE_normPatterns(fb, []);
      return [];
    }
    return out;
  }

  function LIVE_patternsSig(pats) {
    try { return pats.join('|'); } catch { return ''; }
  }

  function LIVE_loadCfg() {
    const fb = {
      schema: 'H2O.sync.live.cfg.v1',
      enabled: false,
      enforcePatterns: true,
      debounceMs: 650,
      pollMs: 2000,
      file: SYNC_FILE_LIVE,
      // MiniMap-first: only "state" keys by default (UI collapsed is per-device).
      patterns: [
        'h2o:prm:cgx:mnmp:state:',
        'h2o:prm:cgx:mnmp:ui:behavior-map:v1',
      ],
    };
    const cfg = store.getJSON(SYNC_KEY_LIVE_CFG, fb) || fb;
    // normalize
    cfg.enabled = !!cfg.enabled;
    cfg.enforcePatterns = cfg.enforcePatterns !== false;
    cfg.debounceMs = Math.max(120, Number(cfg.debounceMs || fb.debounceMs));
    cfg.pollMs = Math.max(500, Number(cfg.pollMs || fb.pollMs));
    cfg.file = String(cfg.file || fb.file || SYNC_FILE_LIVE).trim() || SYNC_FILE_LIVE;
	  // ✅ Fix: fb.patterns is the only valid fallback in this scope (cfg0 is not defined here).
	  cfg.patterns = LIVE_normPatterns(cfg.patterns, fb.patterns);
    try { UTIL_storage.setStr(SYNC_KEY_LIVE_PAT_SIG, LIVE_patternsSig(cfg.patterns)); } catch {}
    return cfg;
  }

  function LIVE_saveCfg(next) {
    const cfg0 = LIVE_loadCfg();
    const cfg = { ...cfg0, ...(next && typeof next === 'object' ? next : {}) };
    // enforce minimal normalization
    cfg.schema = 'H2O.sync.live.cfg.v1';
    cfg.enabled = !!cfg.enabled;
    cfg.enforcePatterns = cfg.enforcePatterns !== false;
    // Normalize using current defaults (cfg0 comes from LIVE_loadCfg)
    cfg.debounceMs = Math.max(120, Number(cfg.debounceMs || cfg0.debounceMs));
    cfg.pollMs = Math.max(500, Number(cfg.pollMs || cfg0.pollMs));
    cfg.file = String(cfg.file || cfg0.file || SYNC_FILE_LIVE).trim() || SYNC_FILE_LIVE;
    cfg.patterns = LIVE_normPatterns(cfg.patterns, cfg0.patterns || []);
    try { UTIL_storage.setStr(SYNC_KEY_LIVE_PAT_SIG, LIVE_patternsSig(cfg.patterns)); } catch {}
    store.setJSON(SYNC_KEY_LIVE_CFG, cfg);
    return cfg;
  }

  function LIVE_samePatterns(a, b) {
    const A = LIVE_normPatterns(a, []);
    const B = LIVE_normPatterns(b, []);
    if (A.length !== B.length) return false;
    for (let i = 0; i < A.length; i++) {
      if (A[i] !== B[i]) return false;
    }
    return true;
  }

  function LIVE_pickKeys(cfg) {
    const pats = (cfg?.patterns || []).map(String);
    if (!pats.length) return [];
    const all = store.listAllKeys();
    return all.filter(k => pats.some(p => String(k).startsWith(p)));
  }

  function LIVE_buildPayload(cfg) {
    const keys = LIVE_pickKeys(cfg);

    // Include meta for concurrency-safe apply.
    // NOTE: meta is not an "item" (we don't want it treated as a normal user key).
    const metaMap = LIVE_loadMeta();
    const dev = LIVE_getDevId();

    // Only include meta entries relevant to the outgoing keys (keeps payload smaller).
    const meta = Object.create(null);
    for (const k of keys) {
      if (!k) continue;
      if (metaMap && metaMap[k]) meta[k] = metaMap[k];
      else meta[k] = { dev, seq: 0 };
    }

    return {
      schema: 'H2O.live.bundle.v2',
      createdAt: SYNC_nowIso(),
      file: String(cfg?.file || SYNC_FILE_LIVE),
      patterns: (cfg?.patterns || []).slice(),
      dev,
      meta,
      items: keys.map(k => ({ k, v: store.getRaw(k, null) })),
    };
  }

  function LIVE_applyPayload(obj, opts = {}) {
    const mode = opts.mode === 'merge' ? 'merge' : 'overwrite';
    const applied = [];
    const skipped = [];
    const failed = [];

    // 🧷 Pattern mismatch hardening:
    // If two systems watch different prefixes, LiveSync becomes silently incomplete.
    // We prevent drift by converging patterns safely:
    // - Never DROP “must-have” patterns (LIVE_REQUIRED_PATTERNS)
    // - Prefer UNION (local ∪ remote ∪ required)
    // - Optionally persist the union when enforcePatterns=true
    // This keeps sync working even if one device had a smaller pattern set.
    try {
      const remoteRaw = Array.isArray(obj?.patterns) ? obj.patterns : null;
      const remoteP = remoteRaw ? LIVE_normPatterns(remoteRaw, []) : null;
      const cfgNow = LIVE_loadCfg();
      const localP = LIVE_normPatterns(cfgNow?.patterns || [], []);

      // Safe union (includes required baseline)
      const unionP = LIVE_normPatterns([ ...(localP || []), ...((remoteP && remoteP.length) ? remoteP : []), ...LIVE_REQUIRED_PATTERNS ], LIVE_REQUIRED_PATTERNS);

      // 👁️ Visibility-only: fingerprint local vs remote patterns for Data Tab display.
      LIVE_diagMarkPatterns(localP, remoteP || null);

      if (cfgNow?.enabled && remoteP && remoteP.length && !LIVE_samePatterns(remoteP, localP)) {
        LIVE_emitStatus('patterns:mismatch', { ok: false, local: localP.slice(), remote: remoteP.slice(), union: unionP.slice() });
      }

      // enforcePatterns=true means “converge patterns automatically”, but convergence is UNION (safe), not blind adoption.
      if (cfgNow?.enabled && cfgNow.enforcePatterns) {
        if (!LIVE_samePatterns(unionP, localP)) {
          LIVE_saveCfg({ patterns: unionP });
          LIVE_emitStatus('patterns:merged', { ok: true, patterns: unionP.slice() });

          // If our union differs from what remote reported, queue a push so remote patterns converge too.
          // This is visibility + self-healing; it does not change core push logic.
          if (remoteP && remoteP.length && !LIVE_samePatterns(unionP, remoteP)) {
            try { state.liveDiag.patterns.needPush = 1; } catch {}
            try { setTimeout(() => LIVE_tryAutoPush('patterns', true), 0); } catch {}
          }
        }
      }
    } catch {}

    const remoteMeta = (obj && typeof obj === 'object' && obj.meta && typeof obj.meta === 'object' && !Array.isArray(obj.meta)) ? obj.meta : null;
    const useMeta = !!remoteMeta;

    // ✅ Bulk mode: collapse many per-key store change events into one batched event
    BULK_APPLY_KEYS.clear();
    BULK_APPLY_MODE = 1;

    // Prevent native storage hooks from treating remote writes as local edits.
    LIVE_REMOTE_APPLY_GUARD = 1;

    // Local meta (for concurrency-safe decisions)
    const localMeta = useMeta ? LIVE_loadMeta() : null;
    let metaDirty = false;

    try {
    for (const it of (obj?.items || [])) {
      const k = String(it?.k || '');
      const v = it?.v;

      if (!k) { skipped.push({ k, why: 'empty-key' }); continue; }

      // Never treat meta keys as normal items.
      if (LIVE_isMetaKey(k)) { skipped.push({ k, why: 'meta-key' }); continue; }

      try {
        const cur = store.getRaw(k, null);

        // MERGE mode: never overwrite an existing different value.
        if (mode === 'merge') {
          if (cur !== null && String(cur) !== String(v)) {
            skipped.push({ k, why: 'merge-skip-exists' });
            continue;
          }
          const ok = UTIL_storage.setStr(k, String(v));
          if (ok) {
            applied.push(k);
            BULK_APPLY_KEYS.add(k);
          } else {
            failed.push({ k, why: 'write-failed' });
          }
          continue;
        }

        // OVERWRITE mode:
        // - If bundle has meta: apply ONLY if remote meta is newer than local meta.
        // - If no meta (legacy bundles): fallback to unconditional overwrite.
        if (useMeta) {
          const r = remoteMeta[k] || null;
          const l = localMeta[k] || null;

          if (!r) {
            // If remote didn't send meta for this key, treat as legacy for this key only.
            const ok = UTIL_storage.setStr(k, String(v));
            if (ok) {
              applied.push(k);
              BULK_APPLY_KEYS.add(k);
              // Do not invent meta; keep existing local meta if any.
            } else failed.push({ k, why: 'write-failed' });
            continue;
          }

          if (!l || LIVE_metaIsNewer(r, l)) {
            // ✅ True Concurrency: remote wins → save losing LOCAL value (optional conflict saver)
            if (cur !== null && String(cur) !== String(v)) {
              LIVE_recordConflict({
                key: k,
                winner: r,
                loser: l,
                loserSide: 'local',
                localVal: cur,
                remoteVal: v,
              });
            }
            const ok = UTIL_storage.setStr(k, String(v));
            if (ok) {
              applied.push(k);
              BULK_APPLY_KEYS.add(k);
              localMeta[k] = r;
              metaDirty = true;
            } else failed.push({ k, why: 'write-failed' });
          } else {
            // Local is newer → skip. Record conflict if values differ.
            if (cur !== null && String(cur) !== String(v)) {
              LIVE_recordConflict({
                key: k,
                winner: l,
                loser: r,
                loserSide: 'remote',
                localVal: cur,
                remoteVal: v,
              });
            }
            skipped.push({ k, why: 'local-newer', local: l, remote: r });
          }
          continue;
        }

        // Legacy overwrite
        const ok = UTIL_storage.setStr(k, String(v));
        if (ok) {
          applied.push(k);
          BULK_APPLY_KEYS.add(k);
        } else failed.push({ k, why: 'write-failed' });
      } catch (e) {
        failed.push({ k, why: 'exception', err: String(e?.message || e) });
      }
    }
    } finally {
      LIVE_REMOTE_APPLY_GUARD = 0;
    }

    // Persist merged meta after apply (outside per-item loop).
    if (useMeta && metaDirty) LIVE_saveMeta(localMeta);

    BULK_APPLY_MODE = 0;

    // Emit ONE batched store change event with all applied keys
    if (BULK_APPLY_KEYS.size) {
      STORE_emitChange('apply', Array.from(BULK_APPLY_KEYS));
      BULK_APPLY_KEYS.clear();
    }

    return { mode, useMeta, applied, skipped, failed };
  }

  let LIVE_timer = null;
  let LIVE_pushTimer = null;
  let LIVE_inFlightPush = false;
  let LIVE_inFlightPoll = false;

  /* ───────────────────────────── 👁️ 8.1B) LIVE VISIBILITY (no logic changes) ─────────────────────────────
   * What this gives you (ControlHub-friendly):
   *  1) Pattern drift visibility: localSig vs remoteSig (+ match flag).
   *  2) "Last live tick" counters: prove poll/push/pull is running without DevTools.
   *
   * Hard rule: this section MUST NOT alter sync decisions. It only records + reports.
   */
  MOD_OBJ.state = MOD_OBJ.state || {};
  const LIVE_DIAG = (MOD_OBJ.state.liveDiag = MOD_OBJ.state.liveDiag || {
    poll: { n: 0, lastAt: null, lastHash: null, lastAction: null },
    push: { n: 0, lastAt: null, lastHash: null, lastReason: null },
    pull: { n: 0, lastAt: null, lastHash: null, lastReport: null },
    patterns: { localSig: null, remoteSig: null, match: null, lastAt: null },
  });

  function UTIL_hashLite(str) {
    // Fast stable fingerprint (NOT crypto). Perfect for "did patterns drift?" UI.
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function LIVE_patternsSig(arr) {
    const a = Array.isArray(arr) ? arr.map(x => String(x)).join('\n') : '';
    return 'p:' + UTIL_hashLite(a);
  }
  function LIVE_diagMark(kind, patch) {
    try {
      const o = LIVE_DIAG[kind];
      if (!o) return;
      Object.assign(o, patch || {});
    } catch {}
  }
  function LIVE_diagMarkPatterns(localPatterns, remotePatterns) {
    try {
      const localSig = LIVE_patternsSig(localPatterns);
      const remoteSig = LIVE_patternsSig(remotePatterns);
      LIVE_DIAG.patterns.localSig = localSig;
      LIVE_DIAG.patterns.remoteSig = remoteSig;
      LIVE_DIAG.patterns.match = (localSig && remoteSig) ? (localSig === remoteSig) : null;
      LIVE_DIAG.patterns.lastAt = SYNC_nowIso();
    } catch {}
  }

  function LIVE_emitStatus(kind, detail = {}) {
    // Always attach latest visibility snapshot (no behavior impact).
    EV_emit(EV_DATA_LIVE_STATUS, { kind, liveDiag: LIVE_DIAG, ...detail });
  }


  /* -------------------------
     Sync Monitor Popup (visibility only)
     - No changes to core push/pull/poll logic
     ------------------------- */

  function SYNC_getLiveDiagSnapshot() {
    try {
      const diag = MOD_OBJ?.state?.liveDiag || null;
      if (!diag) return null;
      // cheap clone to avoid popup mutating live object
      return JSON.parse(JSON.stringify(diag));
    } catch {
      try { return MOD_OBJ?.state?.liveDiag || null; } catch { return null; }
    }
  }

  // Back-compat alias used by older monitor callers.
  function SYNC_getDiagSnapshot() {
    return SYNC_getLiveDiagSnapshot();
  }

  function SYNC_openMonitorPopup() {
    try {
      const title = 'H2O Sync Monitor';
      const w = 430, h = 720;
      const left = Math.max(0, (screen.width - w) - 40);
      const top  = Math.max(0, 60);
      const feat = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
      const win = window.open('', 'H2O_SyncMonitor', feat);
      if (!win) {
        try { alert('Popup blocked. Allow popups for chatgpt.com to use Sync Monitor.'); } catch {}
        return null;
      }

      const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  :root{color-scheme:dark light;}
  body{margin:0;font:12px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#e7e7ea;background:#0f1116;}
  .top{position:sticky;top:0;background:rgba(15,17,22,.92);backdrop-filter:saturate(140%) blur(8px);border-bottom:1px solid rgba(255,255,255,.08);padding:10px 12px;z-index:5}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .ttl{font-weight:700;font-size:13px}
  .badge{padding:2px 8px;border:1px solid rgba(255,255,255,.14);border-radius:999px;opacity:.92}
  .ok{border-color:rgba(50,200,120,.35);color:#bff4d7}
  .bad{border-color:rgba(255,90,90,.35);color:#ffd0d0}
  .mid{padding:10px 12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .card{border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:10px;background:rgba(255,255,255,.03)}
  .k{opacity:.72;margin-bottom:6px}
  .v{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;word-break:break-word}
  .hr{height:1px;background:rgba(255,255,255,.08);margin:10px 0}
  .small{opacity:.75;font-size:11px}
  .btn{cursor:pointer;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;border-radius:10px;padding:6px 10px}
  .btn:hover{background:rgba(255,255,255,.10)}
</style>
</head><body>
  <div class="top">
    <div class="row">
      <div class="ttl">🖥️🛜 Sync Monitor</div>
      <div id="bPoll" class="badge">poll</div>
      <div id="bPush" class="badge">push</div>
      <div id="bPull" class="badge">pull</div>
      <div id="bPat"  class="badge">patterns</div>
      <button id="btnCopy" class="btn">Copy snapshot</button>
    </div>
    <div class="row small" style="margin-top:6px">
      <div>Updated:</div><div id="tNow" class="v"></div>
    </div>
  </div>

  <div class="mid">
    <div class="grid">
      <div class="card"><div class="k">🟦 Poll</div><div id="poll" class="v">…</div></div>
      <div class="card"><div class="k">🟩 Push</div><div id="push" class="v">…</div></div>
      <div class="card"><div class="k">🟨 Pull</div><div id="pull" class="v">…</div></div>
      <div class="card"><div class="k">🧷 Patterns</div><div id="pat" class="v">…</div></div>
    </div>
    <div class="hr"></div>
    <div class="card">
      <div class="k">Raw liveDiag (read-only)</div>
      <pre id="raw" class="v" style="margin:0;white-space:pre-wrap"></pre>
    </div>
  </div>

<script>
(function(){
  function fmt(x){ try{return JSON.stringify(x,null,2)}catch{return String(x)} }
  function isFresh(iso, sec){ if(!iso) return false; const t=+new Date(iso); return (Date.now()-t) < (sec*1000); }
  function setBadge(el, ok){ el.classList.toggle('ok', !!ok); el.classList.toggle('bad', !ok); }

  function readDiag(){
    try {
      const o = window.opener;
      const hs = o?.H2O?.HS?.h2osync || null;
      const sy = o?.H2O?.sync || hs || null;
      const diag =
        hs?.state?.liveDiag ||
        sy?.state?.liveDiag ||
        sy?.getLiveDiagSnapshot?.() ||
        sy?.getDiagSnapshot?.() ||
        sy?.monitor?.getLiveDiag?.() ||
        sy?.monitor?.getDiag?.() ||
        hs?.getLiveDiagSnapshot?.() ||
        hs?.getDiagSnapshot?.() ||
        hs?.monitor?.getLiveDiag?.() ||
        hs?.monitor?.getDiag?.() ||
        null;
      return diag ? JSON.parse(JSON.stringify(diag)) : null;
    } catch(e){ return null; }
  }

  function tick(){
    const d = readDiag();
    const now = new Date().toISOString();
    document.getElementById('tNow').textContent = now;
    if(!d){
      document.getElementById('raw').textContent = 'No liveDiag found in opener.';
      setBadge(document.getElementById('bPoll'), false);
      setBadge(document.getElementById('bPush'), false);
      setBadge(document.getElementById('bPull'), false);
      setBadge(document.getElementById('bPat'), false);
      return;
    }

    const poll = d.poll||{};
    const push = d.push||{};
    const pull = d.pull||{};
    const pat  = d.patterns||{};

    const pollOk = isFresh(poll.lastAt, 30);
    const pushOk = isFresh(push.lastAt, 120);
    const pullOk = isFresh(pull.lastAt, 120);
    const patOk  = pat.match === true;

    setBadge(document.getElementById('bPoll'), pollOk);
    setBadge(document.getElementById('bPush'), pushOk);
    setBadge(document.getElementById('bPull'), pullOk);
    setBadge(document.getElementById('bPat'),  patOk);

    document.getElementById('poll').textContent =
      'n='+(poll.n??0)+'\nlastAt='+(poll.lastAt||'—')+'\nlastAction='+(poll.lastAction||'—')+'\nlastHash='+(poll.lastHash||'—');

    document.getElementById('push').textContent =
      'n='+(push.n??0)+'\nlastAt='+(push.lastAt||'—')+'\nlastReason='+(push.lastReason||'—')+'\nlastHash='+(push.lastHash||'—');

    document.getElementById('pull').textContent =
      'n='+(pull.n??0)+'\nlastAt='+(pull.lastAt||'—')+'\nlastReport='+(pull.lastReport||'—')+'\nlastHash='+(pull.lastHash||'—');

    document.getElementById('pat').textContent =
      'localSig='+(pat.localSig||'—')+'\nremoteSig='+(pat.remoteSig||'—')+'\nmatch='+(pat.match===true?'true':'false')+'\nlastAt='+(pat.lastAt||'—');

    document.getElementById('raw').textContent = fmt(d);
    window.__lastDiag = d;
  }

  document.getElementById('btnCopy').onclick = function(){
    try{
      const txt = fmt(window.__lastDiag || readDiag());
      navigator.clipboard.writeText(txt);
    }catch(e){}
  };

  tick();
  setInterval(tick, 500);
})();
</script>
</body></html>`;

      win.document.open();
      win.document.write(html);
      win.document.close();
      return win;
    } catch {
      return null;
    }
  }

  function SYNC_bindMonitorApi(target) {
    try {
      if (!target || typeof target !== 'object') return target;
      target.getLiveDiagSnapshot = target.getLiveDiagSnapshot || SYNC_getLiveDiagSnapshot;
      target.getDiagSnapshot = target.getDiagSnapshot || SYNC_getDiagSnapshot;
      target.openMonitor = target.openMonitor || SYNC_openMonitorPopup;
      const monitor = (target.monitor && typeof target.monitor === 'object')
        ? target.monitor
        : (target.monitor = {});
      monitor.getDiag = monitor.getDiag || SYNC_getDiagSnapshot;
      monitor.getLiveDiag = monitor.getLiveDiag || SYNC_getLiveDiagSnapshot;
      return target;
    } catch {
      return target;
    }
  }

  // Publish for UI callers (Control Hub / Data Tab), without touching sync core.
  SYNC_bindMonitorApi(MOD_OBJ);
  try {
    // convenience alias: H2O.sync.openMonitor()
    if (sync) {
      SYNC_bindMonitorApi(sync);
      sync.state = sync.state || {};
      sync.state.liveDiag = MOD_OBJ?.state?.liveDiag || sync.state.liveDiag;
    }
  } catch {}
function SYNC_setTarget(target) {
    const t = target && typeof target === 'object' ? target : null;
    if (!t) return SYNC_saveTarget(null);

    if (t.type === 'manual') {
      return SYNC_saveTarget({ type: 'manual', savedAt: SYNC_nowIso() });
    }
    if (t.type === 'webdav') {
      const url = SYNC_normUrl(t.url || t.baseUrl);
      const parsed = SYNC_parseUrl(url);
      const root = String(t.root || t.folder || SYNC_DEFAULT_ROOT).trim() || SYNC_DEFAULT_ROOT;
      return SYNC_saveTarget({
        type: 'webdav',
        savedAt: SYNC_nowIso(),
        url,
        server: String(t.server || parsed.server || '').trim(),
        port: Number(t.port || parsed.port || 443),
        root,
        username: String(t.username || t.user || '').trim(),
      });
    }
    return SYNC_saveTarget(null);
  }

  function SYNC_getTarget() {
    const t = SYNC_loadTarget();
    if (!t) return null;
    if (t.type === 'webdav') {
      const creds = SYNC_loadCreds();
      return { ...t, linked: SYNC_isLinkedState(creds), hasPassword: !!(SYNC_getPassword(creds) || '') };
    }
    return t;
  }

// ───────────────────────────── 🛜 Providers bridge (WebDAV extracted) ─────────────────────────────
// Providers file (0B1c) owns GM_xmlhttpRequest + @connect. Sync stays pure logic/orchestration.
const EV_SYNC_PROVIDERS_READY = 'evt:h2o:sync:providers:ready';

function WAIT_forProviders(cb) {
  if (H2O?.sync?.providers?.webdav?.getJSON && H2O?.sync?.providers?.webdav?.putJSON) return cb();
  const onReady = () => { try { W.removeEventListener(EV_SYNC_PROVIDERS_READY, onReady); } catch {} cb(); };
  try { W.addEventListener(EV_SYNC_PROVIDERS_READY, onReady); CLEAN_add(() => { try { W.removeEventListener(EV_SYNC_PROVIDERS_READY, onReady); } catch {} }); } catch {}
  Promise.resolve().then(() => { if (H2O?.sync?.providers?.webdav?.getJSON && H2O?.sync?.providers?.webdav?.putJSON) onReady(); });
  W.setTimeout(() => { if (H2O?.sync?.providers?.webdav?.getJSON && H2O?.sync?.providers?.webdav?.putJSON) onReady(); }, 250);
}

function SYNC_getWebDavProvider() {
  return (H2O?.sync?.providers?.webdav) || null;
}

function SYNC_getWebDavTransport() {
  const P = SYNC_getWebDavProvider();
  const T = (P && typeof P.transport === 'object') ? P.transport : P;
  if (!T || typeof T !== 'object') return { ok: false, error: 'provider missing' };

  const transport = {
    fileUrl: T.fileUrl,
    test: T.test,
    putText: T.putText,
    putJSON: T.putJSON,
    getJSON: T.getJSON,
  };

  const bad = [];
  const sw = sync?.webdav || {};
  const isLegacySurface = (T === P);
  if (isLegacySurface) {
    // Legacy wrappers from older Sync builds had smaller arity and can recurse into sync.webdav.*.
    if (typeof transport.test === 'function' && (transport.test === sw.test || transport.test.length < 1)) bad.push('test');
    if (typeof transport.putJSON === 'function' && transport.putJSON.length < 3) bad.push('putJSON');
    if (typeof transport.getJSON === 'function' && transport.getJSON.length < 2) bad.push('getJSON');
  }
  if (bad.length) return { ok: false, error: `provider recursion guard (${bad.join(', ')})` };

  return { ok: true, transport };
}

function SYNC_fileUrl(creds, filename) {
  try {
    const tx = SYNC_getWebDavTransport();
    if (tx.ok && typeof tx.transport.fileUrl === 'function') return tx.transport.fileUrl(creds, filename);
  } catch {}
  return SYNC_joinUrl(creds?.url, creds?.root || SYNC_DEFAULT_ROOT, filename);
}

async function SYNC_getRemoteHash(creds, filename) {
  try {
    const tx = SYNC_getWebDavTransport();
    if (!tx.ok || typeof tx.transport.getJSON !== 'function') return null;
    const got = await tx.transport.getJSON(creds, filename);
    return got?.hash || null;
  } catch {
    return null;
  }
}


  // --- unified public API ---
  sync.setTarget = (target) => SYNC_setTarget(target);
  sync.getTarget = () => SYNC_getTarget();

  sync.getStatus = () => {
    const t = SYNC_getTarget();
    const c = SYNC_loadCreds();
    const last = SYNC_loadLast();
    const pass = SYNC_getPassword(c);
    return {
      target: t,
      webdav: c ? {
        linked: SYNC_isLinkedState(c),
        url: c.url,
        server: c.server,
        port: c.port,
        root: c.root,
        username: c.username,
        hasPassword: !!pass,
        rememberPassword: !!c.rememberPassword,
        lastTestAt: c.lastTestAt,
        lastTestOk: !!c.lastTestOk,
        lastErr: c.lastErr,
      } : { linked: false },
      last,
      // 👁️ Visibility-only (Control Hub can render these without any extra APIs)
      liveDiag: MOD_OBJ?.state?.liveDiag || null,
      files: {
        backup: SYNC_FILE_BACKUP,
        vault: SYNC_FILE_VAULT,
        backupUrl: c ? SYNC_fileUrl(c, SYNC_FILE_BACKUP) : null,
        vaultUrl:  c ? SYNC_fileUrl(c, SYNC_FILE_VAULT) : null,
        folderUrl: c ? SYNC_asCollectionUrl(SYNC_joinUrl(c.url, c.root)) : null,
      },
    };
  };

  sync.webdav = sync.webdav || {};

  // Unified creds setter (accepts BOTH new + legacy field names)
  sync.webdav.setCreds = (creds) => {
    const next = (creds && typeof creds === 'object') ? creds : {};
    const prev = SYNC_loadCreds() || {};
    const merged = { ...prev, ...next };

    merged.url = SYNC_normUrl(merged.url || merged.baseUrl || '');
    const parsed = SYNC_parseUrl(merged.url);
    merged.server = String(merged.server || parsed.server || '').trim();
    merged.port = Number(merged.port || parsed.port || 443);
    merged.root = String(merged.root || merged.folder || SYNC_DEFAULT_ROOT).trim() || SYNC_DEFAULT_ROOT;
    merged.username = String(merged.username || merged.user || '').trim();
    const hasPwdField = Object.prototype.hasOwnProperty.call(next, 'password') || Object.prototype.hasOwnProperty.call(next, 'pass');
    const incomingPwd = hasPwdField ? String(next.password || next.pass || '') : '';
    if (hasPwdField && incomingPwd.length > 0) {
      merged.password = incomingPwd;
    } else {
      const prevPass = String(prev.password || '');
      const sessionPass = String(SYNC_getPassword(prev) || '');
      merged.password = prevPass || sessionPass || '';
    }

    const hasRememberField =
      Object.prototype.hasOwnProperty.call(next, 'rememberPassword') ||
      Object.prototype.hasOwnProperty.call(next, 'remember');
    const rememberRequested = hasRememberField
      ? !!(next.rememberPassword || next.remember)
      : !!prev.rememberPassword;
    merged.rememberPassword = rememberRequested && merged.password.length > 0;

    const prevNorm = {
      url: SYNC_normUrl(prev.url || prev.baseUrl || ''),
      server: String(prev.server || '').trim(),
      port: Number(prev.port || 443),
      root: String(prev.root || prev.folder || SYNC_DEFAULT_ROOT).trim() || SYNC_DEFAULT_ROOT,
      username: String(prev.username || prev.user || '').trim(),
      password: String(SYNC_getPassword(prev) || ''),
    };
    const nextNorm = {
      url: merged.url,
      server: merged.server,
      port: merged.port,
      root: merged.root,
      username: merged.username,
      password: String(merged.password || ''),
    };
    const credsChanged =
      nextNorm.url !== prevNorm.url ||
      nextNorm.server !== prevNorm.server ||
      nextNorm.port !== prevNorm.port ||
      nextNorm.root !== prevNorm.root ||
      nextNorm.username !== prevNorm.username ||
      nextNorm.password !== prevNorm.password;
    if (credsChanged || !SYNC_hasUsableCreds(merged)) {
      merged.lastTestAt = null;
      merged.lastTestOk = false;
      merged.lastErr = null;
    }

    const saved = SYNC_saveCreds(merged);
    if (!saved) return false;
    SYNC_setTarget({ type: 'webdav', url: merged.url, server: merged.server, port: merged.port, root: merged.root, username: merged.username });
    return true;
  };

  // ✅ WebDAV Portal button compatibility
  // Many UIs (including yours) label actions as “Link / Unlink”.
  // Expose these aliases so clicks never become no-ops due to naming mismatch.
  sync.webdav.link = (creds) => sync.webdav.setCreds(creds);
  sync.webdav.unlink = () => sync.webdav.clearCreds();

  sync.webdav.clearCreds = () => {
    store.del(SYNC_KEY_CREDS);
    try { sessionStorage.removeItem(`${SYNC_KEY_CREDS}:sessionPass`); } catch {}
    EV_emit(EV_SYNC_WEBDAV_CHANGED, { linked: false });
    return true;
  };

  sync.webdav.isLinked = () => SYNC_isLinkedState(SYNC_loadCreds());

  sync.webdav.test = async () => {
    const c = SYNC_loadCreds();
    if (!c) return { ok: false, status: 0, message: 'no creds' };
    const pass = SYNC_getPassword(c);
    const creds = { ...c, password: pass };
    const tx = SYNC_getWebDavTransport();
    if (!tx.ok || typeof tx.transport.test !== 'function') return { ok: false, status: 0, message: tx.error || 'provider missing' };
    const res = await tx.transport.test(creds);

    const updated = { ...c, lastTestAt: SYNC_nowIso(), lastTestOk: !!res.ok, lastErr: res.ok ? null : (res.message || `HTTP ${res.status}`) };
    SYNC_saveCreds(updated);

    return res;
  };

  sync.providers = sync.providers || {};
  sync.providers.webdav = sync.providers.webdav || {};

  async function SYNC_push(kind, opts = {}) {
    const c = SYNC_loadCreds(); if (!c) throw new Error('no creds');
    const pass = SYNC_getPassword(c);
    const creds = { ...c, password: pass };

    const last = SYNC_loadLast();

    const liveCfg = (kind === 'live') ? LIVE_loadCfg() : null;

    const payload =
      kind === 'backup'
        ? backup.createBundle({})
        : kind === 'vault'
          ? {
              schema: 'H2O.vault.bundle.v1',
              createdAt: SYNC_nowIso(),
              items: store.listMineKeys().filter(k => String(k).includes(':vault:')).map(k => ({ k, v: store.getRaw(k, null) })),
            }
          : LIVE_buildPayload(liveCfg);

    const filename =
      kind === 'backup' ? SYNC_FILE_BACKUP :
      kind === 'vault'  ? SYNC_FILE_VAULT  :
      String(liveCfg?.file || SYNC_FILE_LIVE);

    const remoteHash = await SYNC_getRemoteHash(creds, filename);
    const payloadText = SYNC_serializePayload(payload);
    const localHash = await SYNC_sha256(payloadText);

    if (!opts.force && kind !== 'live' && remoteHash && remoteHash !== localHash) {
      last[kind] = last[kind] || {};
      last[kind].conflict = { at: SYNC_nowIso(), remoteHash, localHash };
      SYNC_saveLast(last);
      return { ok: false, conflict: true, remoteHash, localHash };
    }

    const tx = SYNC_getWebDavTransport();
    if (!tx.ok) throw new Error(tx.error || 'provider missing');
    const putText = tx.transport.putText;
    const putJSON = tx.transport.putJSON;
    if (typeof putText !== 'function' && typeof putJSON !== 'function') throw new Error('provider missing');
    const put = await (typeof putText === 'function' ? putText(creds, filename, payloadText) : putJSON(creds, filename, payload));

    last[kind] = last[kind] || {};
    last[kind].push = { at: SYNC_nowIso(), hash: put.hash || localHash };
    last[kind].remoteHash = put.hash || localHash;
    last[kind].conflict = null;
    SYNC_saveLast(last);

    return { ok: true, ...put, filename };
  }

  async function SYNC_pull(kind, opts = {}) {
    // Backup pulls should be deterministic cross-device: default to OVERWRITE.
    let mode = opts.mode === 'overwrite' ? 'overwrite' : 'merge';
    if (kind === 'backup') mode = 'overwrite';
    const c = SYNC_loadCreds(); if (!c) throw new Error('no creds');
    const pass = SYNC_getPassword(c);
    const creds = { ...c, password: pass };

    const liveCfg = (kind === 'live') ? LIVE_loadCfg() : null;
    const filename =
      kind === 'backup' ? SYNC_FILE_BACKUP :
      kind === 'vault'  ? SYNC_FILE_VAULT  :
      String(liveCfg?.file || SYNC_FILE_LIVE);

    const tx = SYNC_getWebDavTransport();
    if (!tx.ok || typeof tx.transport.getJSON !== 'function') throw new Error(tx.error || 'provider missing');
    const got = await tx.transport.getJSON(creds, filename);
    const last = SYNC_loadLast();

    if (kind === 'backup') {
      const report = backup.restoreBundle(got.obj, { mode });
      last.backup = last.backup || {};
      last.backup.pull = { at: SYNC_nowIso(), hash: got.hash || null, mode };
      last.backup.remoteHash = got.hash || null;
      last.backup.conflict = null;
      SYNC_saveLast(last);
      return { ok: true, report, hash: got.hash };
    }

    if (kind === 'live') {
      // 🔒 LiveSync always uses OVERWRITE (deterministic cross-device). Manual Pull can choose merge.
      const report = LIVE_applyPayload(got.obj, { mode: 'overwrite' });

      // 👁️ tick: pull applied (visibility only)
      LIVE_DIAG.pull.n += 1;
      LIVE_diagMark('pull', {
        lastAt: SYNC_nowIso(),
        lastHash: got.hash || null,
        lastReport: {
          applied: report?.applied?.length || 0,
          skipped: report?.skipped?.length || 0,
          failed: report?.failed?.length || 0,
        },
      });

      last.live = last.live || {};
      last.live.pull = { at: SYNC_nowIso(), hash: got.hash || null, mode: report.mode };
      last.live.remoteHash = got.hash || null;
      last.live.conflict = null;
      SYNC_saveLast(last);
      LIVE_emitStatus('pulled', { ok: true, hash: got.hash || null, report, filename });
      return { ok: true, report, hash: got.hash, filename };
    }

    const applied = [];
    const skipped = [];
    const failed = [];

    for (const { k, v } of (got.obj?.items || [])) {
      try {
        const cur = store.getRaw(k, null);
        if (mode !== 'overwrite' && cur !== null && cur !== v) { skipped.push(k); continue; }
        const ok = store.setRaw(k, v);
        if (ok) applied.push(k); else failed.push(k);
      } catch { failed.push(k); }
    }

    last.vault = last.vault || {};
    last.vault.pull = { at: SYNC_nowIso(), hash: got.hash || null, mode };
    last.vault.remoteHash = got.hash || null;
    last.vault.conflict = null;
    SYNC_saveLast(last);

    return { ok: true, report: { applied, skipped, failed, mode }, hash: got.hash, filename };
  }

  sync.pushBackup = async (opts = {}) => SYNC_push('backup', opts);
  sync.pullBackup = async (opts = {}) => SYNC_pull('backup', opts);
  sync.pushVault  = async (opts = {}) => SYNC_push('vault',  opts);
  sync.pullVault  = async (opts = {}) => SYNC_pull('vault',  opts);

  // Live channel (MiniMap-first). This is the POC for near-instant sync.
  sync.pushLive = async (opts = {}) => SYNC_push('live', opts);
  sync.pullLive = async (opts = {}) => SYNC_pull('live', opts);

  /* ───────────────────────────── 🧷 Legacy WebDAV API shim (keeps old ControlHub) ─────────────────────────────
   * Old calls supported:
   *   - sync.webdav.getState()
   *   - sync.webdav.setCreds({... baseUrl/folder/remember ...})
   *   - sync.webdav.clearCreds()
   *   - sync.webdav.test()
   *   - sync.webdav.pushBackup()/pullBackup()
   *   - sync.webdav.pushVault()/pullVault()
   */

  sync.webdav.getState = () => {
    const c = SYNC_loadCreds();
    const pass = SYNC_getPassword(c);
    const last = SYNC_loadLast();

    const creds = c ? {
      // legacy naming surface
      baseUrl: c.url,
      url: c.url,
      server: c.server,
      port: c.port,
      folder: c.root,
      root: c.root,
      username: c.username,
      password: c.rememberPassword ? String(c.password || '') : '',
      remember: !!c.rememberPassword,
      rememberPassword: !!c.rememberPassword,
      hasPassword: !!pass,
      savedAt: c.savedAt || null,
      lastTestAt: c.lastTestAt || null,
      lastTestOk: !!c.lastTestOk,
      lastErr: c.lastErr || null,
    } : null;

    const state = {
      linked: SYNC_isLinkedState(c),
      hasPassword: !!pass,
      last,
      files: {
        backup: SYNC_FILE_BACKUP,
        vault: SYNC_FILE_VAULT,
        live:  (LIVE_loadCfg()?.file || SYNC_FILE_LIVE),
        backupUrl: c ? SYNC_fileUrl(c, SYNC_FILE_BACKUP) : null,
        vaultUrl:  c ? SYNC_fileUrl(c, SYNC_FILE_VAULT) : null,
        liveUrl:   c ? SYNC_fileUrl(c, String(LIVE_loadCfg()?.file || SYNC_FILE_LIVE)) : null,
        folderUrl: c ? SYNC_asCollectionUrl(SYNC_joinUrl(c.url, c.root)) : null,
      },
    };

    return { creds, state };
  };

  // legacy method names as aliases
  sync.webdav.pushBackup = async (opts = {}) => sync.pushBackup(opts);
  sync.webdav.pullBackup = async (opts = {}) => sync.pullBackup(opts);
  sync.webdav.pushVault  = async (opts = {}) => sync.pushVault(opts);
  sync.webdav.pullVault  = async (opts = {}) => sync.pullVault(opts);

  // Optional: legacy-style access to the live channel (new UI should use sync.pushLive/pullLive)
  sync.webdav.pushLive = async (opts = {}) => sync.pushLive(opts);
  sync.webdav.pullLive = async (opts = {}) => sync.pullLive(opts);

  /* ───────────────────────────── ⚡ LiveSync runtime (auto-push + polling) ───────────────────────────── */

  sync.live = sync.live || {};

  // ✅ Conflict Saver API (read-only helper)
  // Newest first. Useful when you want to recover a lost write.
  sync.live.getConflicts = () => store.getJSON(SYNC_KEY_LIVE_CONFLICTS, []) || [];

  sync.live.getCfg = () => LIVE_loadCfg();
  sync.live.setCfg = (next) => {
    const cfg = LIVE_saveCfg(next);
    // Apply immediately
    try {
      if (cfg.enabled) sync.live.start();
      else sync.live.stop();
    } catch {}
    return cfg;
  };

  sync.live.isEnabled = () => !!LIVE_loadCfg()?.enabled;

  sync.live.start = () => {
    const cfg = LIVE_loadCfg();
    const last = SYNC_loadLast();
    last.live = last.live || {};
    last.live.enabled = true;
    SYNC_saveLast(last);

    if (LIVE_timer) return true;

    // Fast flag used by native storage hooks.
    LIVE_ENABLED_CACHE = 1;
    LIVE_installNativeStorageHooksOnce();

    LIVE_timer = W.setInterval(async () => {
      if (LIVE_inFlightPoll) return;
      LIVE_inFlightPoll = true;
      try {
        // 👁️ tick: poll loop is running
        LIVE_DIAG.poll.n += 1;
        LIVE_diagMark('poll', { lastAt: SYNC_nowIso(), lastAction: 'tick' });

        const c = SYNC_loadCreds();
        if (!c) {
          LIVE_diagMark('poll', { lastAction: 'no-creds' });
          LIVE_emitStatus('poll:no-creds', { ok: false });
          return;
        }
        const pass = SYNC_getPassword(c);
        const creds = { ...c, password: pass };
        const cfgNow = LIVE_loadCfg();
        if (!cfgNow.enabled) return;

        // 👁️ snapshot local patterns sig every poll tick (cheap)
        try { LIVE_diagMarkPatterns(LIVE_normPatterns(cfgNow?.patterns || [], []), null); } catch {}

        const filename = String(cfgNow.file || SYNC_FILE_LIVE);
        const remoteHash = await SYNC_getRemoteHash(creds, filename);
        LIVE_diagMark('poll', { lastHash: remoteHash || null });
        const lastNow = SYNC_loadLast();
        const prev = lastNow?.live?.remoteHash || null;

        // only pull when hash changed
        if (remoteHash && remoteHash !== prev) {
          lastNow.live = lastNow.live || {};
          lastNow.live.polling = true;
          SYNC_saveLast(lastNow);
          const res = await sync.pullLive({ mode: 'overwrite' });
          LIVE_diagMark('poll', { lastAction: 'pulled' });
          LIVE_emitStatus('poll:pulled', { ok: !!res?.ok, remoteHash, filename, report: res?.report });
        } else {
          LIVE_diagMark('poll', { lastAction: 'idle' });
          LIVE_emitStatus('poll:idle', { ok: true, remoteHash: remoteHash || prev, filename });
        }
      } catch (e) {
        LIVE_diagMark('poll', { lastAction: 'error' });
        LIVE_emitStatus('poll:error', { ok: false, error: String(e?.message || e || '') });
      } finally {
        LIVE_inFlightPoll = false;
      }
    }, cfg.pollMs);

    LIVE_emitStatus('started', { ok: true, pollMs: cfg.pollMs });
    return true;
  };

  sync.live.stop = () => {
    try { if (LIVE_timer) W.clearInterval(LIVE_timer); } catch {}
    LIVE_timer = null;
    try { if (LIVE_pushTimer) W.clearTimeout(LIVE_pushTimer); } catch {}
    LIVE_pushTimer = null;
    LIVE_inFlightPoll = false;
    LIVE_ENABLED_CACHE = 0;
    LIVE_inFlightPush = false;
    const last = SYNC_loadLast();
    last.live = last.live || {};
    last.live.enabled = false;
    last.live.polling = false;
    SYNC_saveLast(last);
    LIVE_emitStatus('stopped', { ok: true });
    return true;
  };

  async function LIVE_tryAutoPush(detail = {}) {
    const cfg = LIVE_loadCfg();
    if (!cfg.enabled) return;
    if (LIVE_inFlightPush) return;

    // debounce bursts
    try { if (LIVE_pushTimer) W.clearTimeout(LIVE_pushTimer); } catch {}
    LIVE_pushTimer = W.setTimeout(async () => {
      LIVE_pushTimer = null;
      if (LIVE_inFlightPush) return;
      LIVE_inFlightPush = true;
      try {
        // 👁️ tick: push loop (debounced) fired
        LIVE_DIAG.push.n += 1;
        LIVE_diagMark('push', { lastAt: SYNC_nowIso(), lastReason: detail?.reason || detail?.source || 'liveChanged' });

        const res = await sync.pushLive({ force: true }); // LiveSync = last-write-wins (force)
        if (res?.conflict) {
          LIVE_diagMark('push', { lastHash: null });
          LIVE_emitStatus('push:conflict', { ok: false, conflict: true, remoteHash: res.remoteHash, localHash: res.localHash });
        } else {
          LIVE_diagMark('push', { lastHash: res?.hash || null });
          LIVE_emitStatus('push:ok', { ok: true, hash: res?.hash || null, filename: res?.filename, reason: detail?.reason || detail?.source || 'liveChanged' });
        }
      } catch (e) {
        LIVE_diagMark('push', { lastHash: null });
        LIVE_emitStatus('push:error', { ok: false, error: String(e?.message || e || '') });
      } finally {
        LIVE_inFlightPush = false;
      }
    }, cfg.debounceMs);
  }

  function LIVE_onChangedEvent(ev) {
    const d = ev?.detail || {};
    LIVE_tryAutoPush(d);
  }

// 🔁 Bridge STORE → LiveSync:
// LiveSync auto-push is triggered by EV_DATA_LIVE_CHANGED pulses.
// But most writers (including Wash Engine) emit EV_DATA_STORE_CHANGED via store.setRaw/setJSON.
// So we translate store-changed → liveChanged when the changed keys match LiveSync patterns.
function LIVE_keysMatch(cfg, keys) {
  try {
    const pats = (cfg?.patterns || []).map(String);
    if (!pats.length) return false;
    const arr = Array.isArray(keys) ? keys : [];
    return arr.some(k => pats.some(p => String(k).startsWith(p)));
  } catch { return false; }
}

function LIVE_onStoreChangedEvent(ev) {
  try {
    const cfg = LIVE_loadCfg();
    if (!cfg?.enabled) return;
    const d = ev?.detail || {};
    // 🛑 Prevent ping-pong:
    // Do NOT auto-push when the store change was caused by:
    // - a LiveSync pull/apply (bulkApply)
    // - a cross-tab/localStorage "storage" event (already remote)
    const reason = String(d.reason || '');
    if (reason === 'apply' || reason === 'bulkApply' || reason === 'storage') return;
    const keys = Array.isArray(d.keys) ? d.keys : (d.key ? [d.key] : []);
    if (!LIVE_keysMatch(cfg, keys)) return;
    // Pulse LiveSync with the same key list (so debounced auto-push runs)
    sync.live.pulse({ reason: d.reason || 'storeChanged', source: 'store', keys });
  } catch {}
}


  // Public helper: emit a liveChanged pulse from page context
  sync.live.pulse = (detail = {}) => {
    try { W.dispatchEvent(new CustomEvent(EV_DATA_LIVE_CHANGED, { detail })); return true; } catch { return false; }
  };

  // Wire listener once (idempotent)
  if (!MOD_OBJ.state) MOD_OBJ.state = {};
  if (!MOD_OBJ.state.liveHooked) {
    MOD_OBJ.state.liveHooked = true;
    try {
      W.addEventListener(EV_DATA_LIVE_CHANGED, LIVE_onChangedEvent);
      W.addEventListener(EV_DATA_STORE_CHANGED, LIVE_onStoreChangedEvent);
      CLEAN_add(() => { try { W.removeEventListener(EV_DATA_LIVE_CHANGED, LIVE_onChangedEvent);
        try { W.removeEventListener(EV_DATA_STORE_CHANGED, LIVE_onStoreChangedEvent); } catch {} } catch {} });
    } catch {}
  }



  /* ───────────────────────────── ⬛️ 9) LIFECYCLE (Sync) ───────────────────────────── */

  function CORE_HS_boot() {
    if (MOD_OBJ.state?.booted) return;
    MOD_OBJ.state = MOD_OBJ.state || {};
    MOD_OBJ.state.booted = true;

    DIAG_step('boot', `${TOK}/${PID}`);

    // Compat pointer: some callers use `H2O.data.sync.*`.
    try { H2O.data = H2O.data || {}; H2O.data.sync = H2O.sync; } catch {}

    // Install delegate endpoint used by Core's LIVE_trackLocalWrite shim
    try { H2O.sync = H2O.sync || {}; H2O.sync.live = H2O.sync.live || {}; H2O.sync.live._trackLocalWrite = LIVE_trackLocalWrite; } catch {}

    // Resume LiveSync timers if enabled
    try {
      const cfg = LIVE_loadCfg();
      if (cfg?.enabled) H2O.sync.live.start();
    } catch {}
  }

  function CORE_HS_dispose() {
    if (MOD_OBJ.state) MOD_OBJ.state.booted = false;
    DIAG_step('dispose');
    try { H2O.sync?.live?.stop?.(); } catch {}
    CLEAN_runAll();
  }

  WAIT_forCore(() => {
    WAIT_forProviders(() => {
      try { CORE_HS_boot(); } catch (e) { DIAG_err('boot', e); }
    });
  });

})();
