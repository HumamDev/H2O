// ==UserScript==
// @name         0B1a.⬛️🗄️ Data Core 🗄️
// @namespace    H2O.Prime.CGX.Data.Core
// @version      1.2.7-core.3
// @description  H2O Data Core: store/backup/archive/vault/export + events + lifecycle. Split-safe. No network.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.2.6';
  const VERSION_CORE = '1.2.6-core.2';

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
  const EV_DATA_VAULT_SAVED      = 'evt:h2o:data:vault:saved';
  const EV_DATA_VAULT_REMOVED    = 'evt:h2o:data:vault:removed';

  // split handshake: Core ready (Sync can wait on this)
  const EV_DATA_READY           = 'evt:h2o:data:ready';


  // legacy-friendly sync event (some old UIs listen to this)
  const EV_SYNC_WEBDAV_CHANGED   = 'evt:h2o:sync:webdav:changed';

  // publish into registry (keep-first)
  H2O.EV[`${TOK}_STORE_CHANGED`]   = H2O.EV[`${TOK}_STORE_CHANGED`]   || EV_DATA_STORE_CHANGED;
  H2O.EV[`${TOK}_BACKUP_IMPORTED`] = H2O.EV[`${TOK}_BACKUP_IMPORTED`] || EV_DATA_BACKUP_IMPORTED;
  H2O.EV[`${TOK}_ARCHIVE_SAVED`]   = H2O.EV[`${TOK}_ARCHIVE_SAVED`]   || EV_DATA_ARCHIVE_SAVED;
  H2O.EV[`${TOK}_ARCHIVE_REMOVED`] = H2O.EV[`${TOK}_ARCHIVE_REMOVED`] || EV_DATA_ARCHIVE_REMOVED;
  H2O.EV[`${TOK}_VAULT_SAVED`]     = H2O.EV[`${TOK}_VAULT_SAVED`]     || EV_DATA_VAULT_SAVED;
  H2O.EV[`${TOK}_VAULT_REMOVED`]   = H2O.EV[`${TOK}_VAULT_REMOVED`]   || EV_DATA_VAULT_REMOVED;
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

  /* ───────────────────────────── ⬜️ 5) ARCHIVE (snapshot of current DOM chat) ───────────────────────────── */

  const archive = (H2O.archive = H2O.archive || {});
  const ATTR_MESSAGE_AUTHOR_ROLE = 'data-message-author-role';
  const SEL_ROLES = `[${ATTR_MESSAGE_AUTHOR_ROLE}="user"],[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`;

  const KEY_ARCHIVE_INDEX = `${NS_DISK}:archive:index:v1`;
  const KEY_ARCHIVE_DATA  = (chatId) => `${NS_DISK}:archive:v1:${chatId}`;
  const ARCHIVE_CLAMP = 200;

  function ARCHIVE_loadIndex() {
    return (store.getJSON(KEY_ARCHIVE_INDEX, []) || []).filter(Boolean);
  }
  function ARCHIVE_saveIndex(index) {
    return store.setJSON(KEY_ARCHIVE_INDEX, (index || []).slice(0, ARCHIVE_CLAMP));
  }

  archive.captureLive = (opts = {}) => {
    const chatId = opts.chatId || H2O.util?.getChatId?.() || '';
    const nodes = Array.from(D.querySelectorAll(SEL_ROLES));

    const messages = nodes.map((el) => {
      const role = el.getAttribute(ATTR_MESSAGE_AUTHOR_ROLE) || '';
      const id = H2O.msg?.getIdFromEl?.(el) || '';
      const text = (el.innerText || el.textContent || '').trim();
      const create_time = H2O.time?.getCreateTime?.(el) || null;
      return { id, role, text, create_time };
    });

    return {
      schema: 'H2O.archive.v1',
      chatId,
      capturedAt: new Date().toISOString(),
      href: location.href,
      messages,
    };
  };

  archive.saveLatest = (snapshot) => {
    const chatId = snapshot?.chatId || H2O.util?.getChatId?.() || 'unknown';
    const ok = store.setJSON(KEY_ARCHIVE_DATA(chatId), snapshot);

    const index = ARCHIVE_loadIndex().filter((e) => e?.chatId !== chatId);
    index.unshift({ chatId, capturedAt: snapshot?.capturedAt || new Date().toISOString() });
    ARCHIVE_saveIndex(index);

    EV_emit(EV_DATA_ARCHIVE_SAVED, { chatId, ok });
    return ok;
  };

  archive.getLatest = (chatId = H2O.util?.getChatId?.() || 'unknown') =>
    store.getJSON(KEY_ARCHIVE_DATA(chatId), null);

  archive.remove = (chatId = H2O.util?.getChatId?.() || 'unknown') => {
    const ok = store.del(KEY_ARCHIVE_DATA(chatId));
    const index = ARCHIVE_loadIndex().filter((e) => e?.chatId !== chatId);
    ARCHIVE_saveIndex(index);

    EV_emit(EV_DATA_ARCHIVE_REMOVED, { chatId, ok });
    return ok;
  };

  archive.list = () => ARCHIVE_loadIndex();

  /* ───────────────────────────── ⬜️ 5B) VAULT (versioned snapshots) ───────────────────────────── */

  const vault = (H2O.vault = H2O.vault || {});
  const KEY_VAULT_INDEX = (chatId) => `${NS_DISK}:vault:index:v1:${chatId}`;
  const KEY_VAULT_ITEM  = (chatId, vid) => `${NS_DISK}:vault:v1:${chatId}:${vid}`;

  const VAULT_CLAMP = 200;

  function VAULT_loadIndex(chatId) {
    const arr = store.getJSON(KEY_VAULT_INDEX(chatId), []) || [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  }
  function VAULT_saveIndex(chatId, idx) {
    const safe = (Array.isArray(idx) ? idx : []).slice(0, VAULT_CLAMP);
    return store.setJSON(KEY_VAULT_INDEX(chatId), safe);
  }

  function VAULT_makeId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rnd = Math.random().toString(16).slice(2, 6);
    return `${stamp}-${rnd}`;
  }

  vault.saveVersion = (snapshot, opts = {}) => {
    const chatId = String(snapshot?.chatId || opts.chatId || H2O.util?.getChatId?.() || 'unknown');
    const label = String(opts.label || '').trim();
    const vid = String(opts.vid || VAULT_makeId());

    const entry = {
      chatId,
      vid,
      label,
      savedAt: new Date().toISOString(),
      capturedAt: snapshot?.capturedAt || null,
      count: Array.isArray(snapshot?.messages) ? snapshot.messages.length : 0,
    };

    const ok = store.setJSON(KEY_VAULT_ITEM(chatId, vid), {
      schema: 'H2O.vault.v1',
      ...entry,
      snapshot,
    });

    if (ok) {
      const idx = VAULT_loadIndex(chatId).filter(e => e?.vid !== vid);
      idx.unshift(entry);
      VAULT_saveIndex(chatId, idx);
      EV_emit(EV_DATA_VAULT_SAVED, { chatId, vid, ok, entry });
    }
    return { ok, chatId, vid, entry };
  };

  vault.saveFromArchiveLatest = (opts = {}) => {
    const chatId = String(opts.chatId || H2O.util?.getChatId?.() || 'unknown');
    const snap = archive.getLatest(chatId);
    if (!snap) return { ok: false, chatId, vid: null, reason: 'no_archive_latest' };
    return vault.saveVersion(snap, { chatId, label: opts.label || 'Archive Latest' });
  };

  vault.list = (chatId = H2O.util?.getChatId?.() || 'unknown') => VAULT_loadIndex(String(chatId));

  vault.get = (chatId = H2O.util?.getChatId?.() || 'unknown', vid) => {
    if (!vid) return null;
    return store.getJSON(KEY_VAULT_ITEM(String(chatId), String(vid)), null);
  };

  vault.latest = (chatId = H2O.util?.getChatId?.() || 'unknown') => {
    const idx = VAULT_loadIndex(String(chatId));
    const first = idx[0];
    if (!first?.vid) return null;
    return vault.get(String(chatId), String(first.vid));
  };

  vault.remove = (chatId = H2O.util?.getChatId?.() || 'unknown', vid) => {
    if (!vid) return { ok: false };
    const c = String(chatId);
    const v = String(vid);
    const ok = store.del(KEY_VAULT_ITEM(c, v));
    const idx = VAULT_loadIndex(c).filter(e => e?.vid !== v);
    VAULT_saveIndex(c, idx);
    EV_emit(EV_DATA_VAULT_REMOVED, { chatId: c, vid: v, ok });
    return { ok };
  };

  /* ───────────────────────────── ⬜️ 6) EXPORT (text conversions + downloads) ───────────────────────────── */

  const ext = (H2O.export = H2O.export || {});

  const escapeMd = (s) => String(s || '').replaceAll('\\', '\\\\').replaceAll('`', '\\`');
  const escapeHtml = (s) => String(s || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  ext.toMarkdown = (snapshot, opts = {}) => {
    const title = String(opts.title || '').trim();
    const lines = [];
    if (title) lines.push(`# ${escapeMd(title)}`, '');

    for (const msg of (snapshot?.messages || [])) {
      lines.push(`**${msg.role || 'msg'}**`);
      lines.push(escapeMd(msg.text || ''), '');
    }
    return lines.join('\n').trim() + '\n';
  };

  ext.toHTML = (snapshot, opts = {}) => {
    const title = String(opts.title || '').trim();
    const parts = [];
    parts.push('<!doctype html><meta charset="utf-8">');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    parts.push('<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}h1{margin:0 0 10px}.meta{opacity:.7;font-size:12px;margin-bottom:16px}.msg{padding:12px 14px;border-radius:12px;margin:10px 0;white-space:pre-wrap}.user{background:rgba(80,120,255,.08)}.assistant{background:rgba(0,0,0,.04)}.role{font-size:12px;opacity:.7;margin-bottom:6px}</style>');
    if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);
    parts.push(`<div class="meta">Captured: ${escapeHtml(snapshot?.capturedAt || '')}</div>`);

    for (const msg of (snapshot?.messages || [])) {
      const cls = msg.role === 'user' ? 'user' : 'assistant';
      parts.push(`<div class="msg ${cls}"><div class="role">${escapeHtml(msg.role || '')}</div>${escapeHtml(msg.text || '')}</div>`);
    }
    return parts.join('\n');
  };

  ext.downloadText = (filename, text, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([String(text || '')], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = D.createElement('a');
    a.href = url;
    a.download = filename || `H2O_export_${Date.now()}.txt`;
    D.body.appendChild(a);
    a.click();
    a.remove();
    W.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  ext.downloadBlob = (filename, blob) => {
    try {
      const url = URL.createObjectURL(blob);
      const anchor = D.createElement('a');
      anchor.href = url;
      anchor.download = filename || `H2O_blob_${Date.now()}`;
      D.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      return true;
    } catch (e) {
      console.warn('[H2O.Data] downloadBlob failed', e);
      return false;
    }
  };


// Lazy-load DOCX exporter (avoids hard @require failures that can stop Core from booting).
// Note: first call may fallback to .doc; subsequent calls after load will produce .docx.
let _docxLibPromise = null;
function EXT_ensureDocxLib() {
  try {
    if (W.htmlDocx && typeof W.htmlDocx.asBlob === 'function') return Promise.resolve(true);
    if (_docxLibPromise) return _docxLibPromise;
    _docxLibPromise = new Promise((resolve) => {
      try {
        const s = D.createElement('script');
        s.src = 'https://unpkg.com/html-docx-js/dist/html-docx.js';
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        (D.head || D.documentElement || D.body).appendChild(s);
      } catch { resolve(false); }
    });
    return _docxLibPromise;
  } catch { return Promise.resolve(false); }
}

  ext.downloadDOCXReal = (snapshot, filename, title) => {
    const htmlDocx = W.htmlDocx;
    if (!htmlDocx || typeof htmlDocx.asBlob !== 'function') {
      // kick off lazy load for next time
      try { EXT_ensureDocxLib(); } catch {}
    }
    if (!htmlDocx || typeof htmlDocx.asBlob !== 'function') {
      console.warn('[H2O.Data] DOCX exporter unavailable (missing htmlDocx.asBlob)');
      if (typeof ext.downloadDOC === 'function') {
        return ext.downloadDOC(snapshot, String(filename || '').replace(/\.docx$/i, '.doc') || `chat_${snapshot?.chatId || 'unknown'}.doc`, title);
      }
      return false;
    }
    const html = ext.toHTML(snapshot, { title });
    const blob = htmlDocx.asBlob(String(html || ''));
    const fname = filename || `chat_${snapshot?.chatId || 'unknown'}.docx`;
    return ext.downloadBlob(fname, blob);
  };

  ext.downloadMarkdown = (snapshot, filename, title) =>
    ext.downloadText(filename || `chat_${snapshot?.chatId || 'unknown'}.md`, ext.toMarkdown(snapshot, { title }), 'text/markdown;charset=utf-8');

  ext.downloadHTML = (snapshot, filename, title) =>
    ext.downloadText(filename || `chat_${snapshot?.chatId || 'unknown'}.html`, ext.toHTML(snapshot, { title }), 'text/html;charset=utf-8');

  ext.downloadJSON = (snapshot, filename) =>
    ext.downloadText(filename || `chat_${snapshot?.chatId || 'unknown'}.json`, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');

  ext.downloadPDF = (snapshot, filename, title) => {
    const html = ext.toHTML(snapshot, { title });
    const w = W.open('', '_blank', 'noopener,noreferrer');
    if (!w) return false;

    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      try { w.document.title = filename || `chat_${snapshot?.chatId || 'unknown'}`; } catch {}
      W.setTimeout(() => {
        try { w.focus(); } catch {}
        try { w.print(); } catch {}
      }, 250);
      return true;
    } catch (e) {
      DIAG_err('downloadPDF', e);
      try { w.close(); } catch {}
      return false;
    }
  };

  ext.downloadDOC = (snapshot, filename, title) => {
    const html = ext.toHTML(snapshot, { title });
    const docHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || '')}</title></head><body>${html}</body></html>`;
    const out = filename || `chat_${snapshot?.chatId || 'unknown'}.doc`;
    ext.downloadText(out, docHtml, 'application/msword;charset=utf-8');
    return true;
  };



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
