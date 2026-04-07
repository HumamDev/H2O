// ==UserScript==
// @h2o-id             0d1a.data.core
// @name               0D1a.⬛️🗄️ Data Core 🗄️
// @namespace          H2O.Premium.CGX.data.core
// @author             HumamDev
// @version            1.4.0
// @revision           001
// @build              260404-000000
// @description        H2O Data Core: store/backup/archive + events + lifecycle. Vault merged into snapshots. Export in 5A1b.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              unsafeWindow
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.4.0';
  const VERSION_CORE = '1.4.0-core.1';

  // IMPORTANT:
  // This module uses GM_xmlhttpRequest (userscript sandbox).
  // Control Hub runs with @grant none (page context) and reads window.H2O.
  // Therefore public APIs must be written into the *page* window (unsafeWindow).
  const W_PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W_PAGE.document;
  const W = W_PAGE;
  const TOPW = W_PAGE.top || W_PAGE;

  /* ───────────────────────────── ⬜️ 0) IDENTITY / META ───────────────────────────── */
  // Identity is USER-owned: keep yours.
  const TOK = 'HD';
  const PID = 'h2odata';
  const CID = 'HData';
  const SkID = 'h2dt';

  const MODTAG = 'HData';
  const MODICON = '🗄️';
  const EMOJI_HDR = '⬛️🗄️';
  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const CID_UP = CID.toUpperCase();

  // H2O root
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

  // bounded DIAG
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  // registries (don’t overwrite)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  // disk/event namespaces (boundary-only; no trailing ":")
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_EV   = `h2o.ev:${SUITE}:${HOST}:${DsID}`;

  /* ───────────────────────────── 🟩 UTIL — diag + safe helpers ───────────────────────────── */

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

  // storage wrapper (single boundary)
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

  /* ───────────────────────────── ⬜️ 1) EVENTS (canonical) ───────────────────────────── */

  const EV_DATA_STORE_CHANGED    = 'evt:h2o:data:store:changed';
  const EV_DATA_BACKUP_IMPORTED  = 'evt:h2o:data:backup:imported';
  const EV_DATA_ARCHIVE_SAVED    = 'evt:h2o:data:archive:saved';
  const EV_DATA_ARCHIVE_REMOVED  = 'evt:h2o:data:archive:removed';
  // EV_DATA_VAULT_SAVED/REMOVED — vault merged into snapshot system (v1.4.0)

  // split handshake: Core ready (Sync can wait on this)
  const EV_DATA_READY           = 'evt:h2o:data:ready';


  // legacy-friendly sync event (some old UIs listen to this)
  const EV_SYNC_WEBDAV_CHANGED   = 'evt:h2o:sync:webdav:changed';

  // publish into registry (keep-first)
  H2O.EV[`${TOK}_STORE_CHANGED`]   = H2O.EV[`${TOK}_STORE_CHANGED`]   || EV_DATA_STORE_CHANGED;
  H2O.EV[`${TOK}_BACKUP_IMPORTED`] = H2O.EV[`${TOK}_BACKUP_IMPORTED`] || EV_DATA_BACKUP_IMPORTED;
  H2O.EV[`${TOK}_ARCHIVE_SAVED`]   = H2O.EV[`${TOK}_ARCHIVE_SAVED`]   || EV_DATA_ARCHIVE_SAVED;
  H2O.EV[`${TOK}_ARCHIVE_REMOVED`] = H2O.EV[`${TOK}_ARCHIVE_REMOVED`] || EV_DATA_ARCHIVE_REMOVED;
  H2O.EV[`${TOK}_READY`]           = H2O.EV[`${TOK}_READY`]           || EV_DATA_READY;
  H2O.EV[`${TOK}_SYNC_WEBDAV_CHANGED`] = H2O.EV[`${TOK}_SYNC_WEBDAV_CHANGED`] || EV_SYNC_WEBDAV_CHANGED;
  H2O.EV['SYNC_WEBDAV_CHANGED'] = H2O.EV['SYNC_WEBDAV_CHANGED'] || EV_SYNC_WEBDAV_CHANGED;

  function EV_emit(topic, detail = {}) {
    const emitTarget = H2O.events?.emit || H2O.bus?.emit;
    if (emitTarget) return SAFE_call('emit(bus)', () => emitTarget(topic, detail));
    return SAFE_call('emit(dom)', () => W.dispatchEvent(new CustomEvent(topic, { detail })));
  }

  /* ───────────────────────────── ⬜️ 2) CLEANUP (idempotent) ───────────────────────────── */

  const CLEAN = [];
  function CLEAN_add(fn) { if (typeof fn === 'function') CLEAN.push(fn); }
  function CLEAN_runAll() {
    for (let i = CLEAN.length - 1; i >= 0; i--) {
      try { CLEAN[i](); } catch (e) { DIAG_err('cleanup', e); }
    }
    CLEAN.length = 0;
  }


  // ───────────────────────────── 🧩 Split bridge: delegate Live meta tracking (Sync owns it) ─────────────────────────────
  // Core remains network/GM-free; Sync installs the real tracker.
  function LIVE_trackLocalWrite(key, why) {
    try {
      const k = String(key || '');
      if (!k) return;
      if (k.startsWith(`${NS_DISK}:sync:`)) return;
      return W.H2O?.sync?.live?._trackLocalWrite?.(k, why);
    } catch { return; }
  }

/* ───────────────────────────── ⬜️ 3) STORE (core) ───────────────────────────── */

  const store = (H2O.store = H2O.store || {});
  store.prefixes = store.prefixes || [
    `${NS_DISK}:`,
    `${NS_EV}:`,
    'h2o:',
    'H2O:',
    'ho:', // legacy reads only
    'ho_', // legacy reads only
  ];
  store.registry = store.registry || new Set();

  // Bulk-apply guard: avoid N× expensive listeners during pull/apply
  let BULK_APPLY_MODE = 0;
  const BULK_APPLY_KEYS = new Set();

  function STORE_emitChange(reason, keys = []) {
    if (BULK_APPLY_MODE) { try { (keys || []).forEach(k => BULK_APPLY_KEYS.add(String(k))); } catch {} return; }

    EV_emit(EV_DATA_STORE_CHANGED, { reason, keys: Array.isArray(keys) ? keys.slice() : [] });
  }


  // Split bridge: allow Sync to emit one batched store-changed event without importing Core internals
  H2O.data = H2O.data || {};
  H2O.data._emitStoreChange = H2O.data._emitStoreChange || STORE_emitChange;
store.registerKey = (key) => {
    if (!key) return key;
    try { store.registry.add(String(key)); } catch {}
    return key;
  };

  store.listAllKeys = () => UTIL_storage.keys();

  store.listMineKeys = (prefixes = store.prefixes) => {
    const keys = store.listAllKeys();
    const filter = Array.isArray(prefixes) ? prefixes : [];
    return keys.filter(k => filter.some(p => String(k).startsWith(p)));
  };

  store.getRaw = (key, fallback = null) => UTIL_storage.getStr(key, fallback);

  store.setRaw = (key, value) => {
    const ok = UTIL_storage.setStr(key, String(value));
    if (ok) {
      STORE_emitChange('setRaw', [key]);
      LIVE_trackLocalWrite(key, 'setRaw');
    }
    return ok;
  };

  store.del = (key) => {
    const ok = UTIL_storage.del(key);
    if (ok) {
      STORE_emitChange('del', [key]);
      LIVE_trackLocalWrite(key, 'del');
    }
    return ok;
  };

  store.getJSON = (key, fallback = null) => UTIL_storage.getJSON(key, fallback);

  store.setJSON = (key, obj) => {
    const ok = UTIL_storage.setJSON(key, obj);
    if (ok) {
      STORE_emitChange('setJSON', [key]);
      LIVE_trackLocalWrite(key, 'setJSON');
    }
    return ok;
  };

  store.resolvePattern = (pattern, ctx = {}) => {
    const chatId = ctx.chatId || (H2O.util?.getChatId?.() ?? '');
    const hash = ctx.hash || '';
    return String(pattern || '')
      .replaceAll('{chatId}', String(chatId))
      .replaceAll('{hash}', String(hash));
  };

  /* ───────────────────────────── ⬜️ 4) BACKUP (bundle) ───────────────────────────── */

  const backup = (H2O.backup = H2O.backup || {});

  function BACKUP_buildBundle(opts = {}) {
    const prefixes = Array.isArray(opts.prefixes) ? opts.prefixes : store.prefixes;
    const keys = Array.isArray(opts.keys) ? opts.keys : store.listMineKeys(prefixes);

    const items = [];
    for (const k of keys) {
      const v = store.getRaw(k, null);
      if (v == null) continue;
      items.push({ k, v });
    }

    return {
      schema: 'H2O.backup.v1',
      createdAt: new Date().toISOString(),
      origin: {
        href: location.href,
        chatId: H2O.util?.getChatId?.() || '',
        ua: navigator.userAgent,
      },
      count: items.length,
      items,
    };
  }

  backup.createBundle = (opts = {}) => BACKUP_buildBundle(opts);
  backup.exportBundle = (opts = {}) => BACKUP_buildBundle(opts); // legacy

  backup.diffBundle = (bundle) => {
    const result = { missing: [], same: [], changed: [] };
    (bundle?.items || []).forEach(({ k, v }) => {
      const current = store.getRaw(k, null);
      if (current === null) result.missing.push(k);
      else if (current === v) result.same.push(k);
      else result.changed.push(k);
    });
    return result;
  };

  backup.restoreBundle = (bundle, opts = {}) => {
    const mode = opts.mode === 'overwrite' ? 'overwrite' : 'merge';
    const report = { applied: [], skipped: [], failed: [], mode };

    for (const { k, v } of (bundle?.items || [])) {
      try {
        const current = store.getRaw(k, null);
        if (mode !== 'overwrite' && current !== null && current !== v) {
          report.skipped.push(k);
          continue;
        }
        const ok = store.setRaw(k, v);
        if (ok) report.applied.push(k);
        else report.failed.push(k);
      } catch {
        report.failed.push(k);
      }
    }

    EV_emit(EV_DATA_BACKUP_IMPORTED, { report });
    return report;
  };

  backup.importBundle = (bundle, opts = {}) => backup.restoreBundle(bundle, opts); // legacy

  backup.downloadBundle = (bundle, filename) => {
    const text = JSON.stringify(bundle, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = D.createElement('a');
    a.href = url;
    a.download = filename || `H2O_backup_${Date.now()}.json`;
    D.body.appendChild(a);
    a.click();
    a.remove();
    W.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  /* ───────────────────────────── ⬜️ 5) ARCHIVE (delegated to 0B1d) ───────────────────────────── */

  const archive = (H2O.archive = H2O.archive || {});

  function ARCH_api() {
    const api = H2O.archiveBoot;
    return (api && typeof api === 'object') ? api : null;
  }

  archive.captureLive = (opts = {}) => {
    const api = ARCH_api();
    if (!api || typeof api.captureLive !== 'function') return null;
    return api.captureLive(opts);
  };

  archive.saveLatest = (snapshot) => {
    const api = ARCH_api();
    const chatId = String(snapshot?.chatId || H2O.util?.getChatId?.() || 'unknown');
    if (!api || typeof api.saveLatest !== 'function') return false;
    try {
      const out = api.saveLatest(snapshot);
      if (out && typeof out.then === 'function') {
        return out.then((ok) => {
          EV_emit(EV_DATA_ARCHIVE_SAVED, { chatId, ok: !!ok });
          return ok;
        }).catch((e) => {
          DIAG_err('archive.saveLatest', e);
          EV_emit(EV_DATA_ARCHIVE_SAVED, { chatId, ok: false });
          return false;
        });
      }
      EV_emit(EV_DATA_ARCHIVE_SAVED, { chatId, ok: !!out });
      return out;
    } catch (e) {
      DIAG_err('archive.saveLatest', e);
      EV_emit(EV_DATA_ARCHIVE_SAVED, { chatId, ok: false });
      return false;
    }
  };

  archive.getLatest = (chatId = H2O.util?.getChatId?.() || 'unknown') => {
    const api = ARCH_api();
    if (!api || typeof api.getLatest !== 'function') return null;
    return api.getLatest(chatId);
  };

  archive.remove = (chatId = H2O.util?.getChatId?.() || 'unknown') => {
    const api = ARCH_api();
    if (!api || typeof api.remove !== 'function') return false;
    try {
      const out = api.remove(chatId);
      if (out && typeof out.then === 'function') {
        return out.then((res) => {
          EV_emit(EV_DATA_ARCHIVE_REMOVED, { chatId, ok: !!res });
          return res;
        }).catch((e) => {
          DIAG_err('archive.remove', e);
          EV_emit(EV_DATA_ARCHIVE_REMOVED, { chatId, ok: false });
          return false;
        });
      }
      EV_emit(EV_DATA_ARCHIVE_REMOVED, { chatId, ok: !!out });
      return out;
    } catch (e) {
      DIAG_err('archive.remove', e);
      EV_emit(EV_DATA_ARCHIVE_REMOVED, { chatId, ok: false });
      return false;
    }
  };

  archive.list = () => {
    const api = ARCH_api();
    if (!api || typeof api.list !== 'function') return [];
    return api.list();
  };

/* ───────────────────────────── ⬜️ 5B) VAULT — merged into Snapshot system (v1.4.0) ───────────────────────────── */
  /*
   * Vault has been merged into the Snapshot engine (0D3a archiveBoot).
   * Labeled versions are now a metadata field on snapshots.
   * This shim keeps H2O.vault.* working for all existing consumers.
   *
   * Mapping:
   *   vault.saveVersion(snap, {label})   → archiveBoot.captureWithOptions({label, snapshot: snap})
   *   vault.saveFromArchiveLatest({label}) → archiveBoot.captureWithOptions({label})
   *   vault.list(chatId)                 → archiveBoot.listSnapshots(chatId)
   *   vault.get(chatId, vid)             → archiveBoot.loadSnapshot(vid)
   *   vault.latest(chatId)               → archiveBoot.loadLatestSnapshot(chatId)
   *   vault.remove(chatId, vid)          → archiveBoot.deleteSnapshot(vid)
   */

  const vault = (H2O.vault = H2O.vault || {});

  vault.saveVersion = (snapshot, opts = {}) => {
    const ab = H2O.archiveBoot;
    if (!ab || typeof ab.captureWithOptions !== 'function') {
      // Fallback: original localStorage vault (for when archiveBoot hasn't booted yet)
      const chatId = String(snapshot?.chatId || opts.chatId || H2O.util?.getChatId?.() || 'unknown');
      const label = String(opts.label || '').trim();
      const vid = opts.vid || `v_${Date.now().toString(36)}_${Math.random().toString(16).slice(2,6)}`;
      const key = `${NS_DISK}:vault:v1:${chatId}:${vid}`;
      const entry = { chatId, vid, label, savedAt: new Date().toISOString(), count: Array.isArray(snapshot?.messages) ? snapshot.messages.length : 0 };
      const ok = store.setJSON(key, { schema: 'H2O.vault.v1', ...entry, snapshot });
      return { ok, chatId, vid, entry };
    }
    return ab.captureWithOptions({ label: opts.label || '', snapshot, chatId: snapshot?.chatId || opts.chatId });
  };

  vault.saveFromArchiveLatest = (opts = {}) => {
    const ab = H2O.archiveBoot;
    if (!ab) return { ok: false, reason: 'snapshot-engine-not-ready' };
    const chatId = String(opts.chatId || H2O.util?.getChatId?.() || 'unknown');
    if (typeof ab.captureWithOptions === 'function') {
      return ab.captureWithOptions({ chatId, label: opts.label || 'Archive Latest' });
    }
    // Legacy path
    const snap = archive.getLatest(chatId);
    if (!snap) return { ok: false, chatId, vid: null, reason: 'no_archive_latest' };
    return vault.saveVersion(snap, { chatId, label: opts.label || 'Archive Latest' });
  };

  vault.list = (chatId) => {
    const cid = String(chatId || H2O.util?.getChatId?.() || 'unknown');
    const ab = H2O.archiveBoot;
    if (ab && typeof ab.listSnapshots === 'function') {
      try {
        const result = ab.listSnapshots(cid);
        if (result && typeof result.then === 'function') return result;
        return Array.isArray(result) ? result : [];
      } catch { return []; }
    }
    // Legacy: read from localStorage vault index
    const idx = store.getJSON(`${NS_DISK}:vault:index:v1:${cid}`, []);
    return Array.isArray(idx) ? idx.filter(Boolean) : [];
  };

  vault.get = (chatId, vid) => {
    const ab = H2O.archiveBoot;
    if (ab && typeof ab.loadSnapshot === 'function' && vid) {
      return ab.loadSnapshot(String(vid));
    }
    // Legacy
    if (!vid) return null;
    return store.getJSON(`${NS_DISK}:vault:v1:${String(chatId || 'unknown')}:${String(vid)}`, null);
  };

  vault.latest = (chatId) => {
    const ab = H2O.archiveBoot;
    if (ab && typeof ab.loadLatestSnapshot === 'function') {
      return ab.loadLatestSnapshot(String(chatId || H2O.util?.getChatId?.() || 'unknown'));
    }
    return null;
  };

  vault.remove = (chatId, vid) => {
    const ab = H2O.archiveBoot;
    if (ab && typeof ab.deleteSnapshot === 'function' && vid) {
      return ab.deleteSnapshot(String(vid));
    }
    // Legacy
    if (!vid) return { ok: false };
    const c = String(chatId || 'unknown');
    const ok = store.del(`${NS_DISK}:vault:v1:${c}:${String(vid)}`);
    return { ok };
  };

  /* ───────────────────────────── ⬜️ 6) EXPORT — shim (moved to 5A1b Export Formats) ───────────────────────────── */
  // Export converters + download triggers now live in 5A1b (H2O.exportFormats).
  // This shim keeps H2O.export.* working for all existing consumers.
  // When 5A1b boots, it registers H2O.exportFormats and patches H2O.export.
  // If 5A1b boots AFTER Core, the getter below resolves it lazily.
  // If 5A1b boots BEFORE Core, H2O.export is already populated.

  if (!H2O.export) {
    try {
      Object.defineProperty(H2O, 'export', {
        configurable: true,
        enumerable: true,
        get: () => H2O.exportFormats || null,
        set: (v) => {
          // Allow 5A1b or legacy code to assign directly
          Object.defineProperty(H2O, 'export', {
            configurable: true, enumerable: true, writable: true, value: v,
          });
        },
      });
    } catch {
      // Fallback: plain assignment (some environments don't allow defineProperty on H2O)
      H2O.export = H2O.exportFormats || null;
    }
  }


/* ───────────────────────────── ⬛️ 9) LIFECYCLE ───────────────────────────── */

  const storageListener = (event) => {
    const key = event?.key;
    if (!key) return;
    const mine = store.prefixes.some((p) => String(key).startsWith(p));
    if (!mine) return;
    STORE_emitChange('storage', [key]);
  };

  function CORE_HD_boot() {
    if (MOD_OBJ.state?.booted) return;
    MOD_OBJ.state = MOD_OBJ.state || {};
    MOD_OBJ.state.booted = true;

    DIAG_step('boot', `${TOK}/${PID}`);

    W.addEventListener('storage', storageListener);
    CLEAN_add(() => { try { W.removeEventListener('storage', storageListener); } catch {} });

    // stable entry
    H2O.data = H2O.data || {};
    H2O.data.boot = CORE_HD_boot;
    H2O.data.dispose = CORE_HD_dispose;
    H2O.data.version = MOD_OBJ.meta?.version || VERSION;
    H2O.data.ready = { ok: true, version: H2O.data.version, ns: { NS_DISK, NS_EV }, emit: EV_emit };

  // 🧩 keep a stable link to the Sync hub (regardless of load order)
  // H2O.data.sync is a getter that always resolves to window.H2O.sync.
  if (!('sync' in H2O.data)) {
    try {
      Object.defineProperty(H2O.data, 'sync', {
        configurable: true,
        enumerable: true,
        get: () => (W.H2O ? W.H2O.sync : undefined),
        set: (v) => {
          try {
            Object.defineProperty(H2O.data, 'sync', { configurable: true, enumerable: true, writable: true, value: v });
          } catch {}
        },
      });
    } catch {}
  }
    EV_emit(EV_DATA_STORE_CHANGED, { reason: 'boot', keys: [] });
    EV_emit(H2O.EV[`${TOK}_READY`], { ok: true, version: H2O.data.version });
    // Also emit as DOM event (some modules listen on window, not H2O bus)
    try { W.dispatchEvent(new CustomEvent(H2O.EV[`${TOK}_READY`], { detail: { ok: true, version: H2O.data.version } })); } catch {}
  }

  function CORE_HD_dispose() {
    if (MOD_OBJ.state) MOD_OBJ.state.booted = false;
    DIAG_step('dispose');
CLEAN_runAll();
  }

  CORE_HD_boot();

})();