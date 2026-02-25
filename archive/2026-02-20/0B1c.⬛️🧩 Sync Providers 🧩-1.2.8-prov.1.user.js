// ==UserScript==
// @name         0B1c.⬛️🧩 Sync Providers 🧩 (WebDAV)
// @namespace    H2O.Prime.CGX.Data.Providers
// @version      1.2.8-prov.1
// @description  H2O Providers: extracted WebDAV transport (GM_xmlhttpRequest). Used by H2O Sync.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @connect      app.koofr.net
// @connect      *.koofr.net
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.2.6-prov.1';

  // Page bridge
  const W_PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W_PAGE.top || W_PAGE;
  const W = W_PAGE;

  // Reuse Sync bucket to avoid introducing a new identity surface.
  const TOK = 'HS';
  const PID = 'h2osync';
  const BrID = PID;

  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;
  H2O[TOK] = H2O[TOK] || {};
  const MOD_OBJ = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  MOD_OBJ.meta = MOD_OBJ.meta || {};
  try { MOD_OBJ.meta.versionProviders = VERSION; } catch {}

  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  function UTIL_capPush(arr, item, max) {
    try { arr.push(item); if (arr.length > max) arr.splice(0, arr.length - max); } catch {}
  }
  function DIAG_step(msg, extra) {
    UTIL_capPush(DIAG.steps, { t: Math.round(performance.now() - DIAG.t0), msg, extra: extra ? String(extra) : undefined }, DIAG.bufMax);
  }
  function DIAG_err(msg, err) {
    UTIL_capPush(DIAG.errors, { t: Math.round(performance.now() - DIAG.t0), msg, err: String(err?.stack || err || '') }, DIAG.errMax);
  }

  const EV_SYNC_PROVIDERS_READY = 'evt:h2o:sync:providers:ready';

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

  function SYNC_asCollectionUrl(u) {
    const s = String(u || '');
    if (!s) return s;
    return s.endsWith('/') ? s : (s + '/');
  }

  function SYNC_pickFinalUrl(r, fallback) {
    const fu = r && (r.finalUrl || r.responseURL);
    if (!fu) return fallback;
    return SYNC_asCollectionUrl(SYNC_normUrl(fu));
  }

  function WEBDAV_isOkStatus(status) {
    return (status >= 200 && status < 300) || status === 207;
  }

  function WEBDAV_isRedirect(status) {
    return status === 301 || status === 302 || status === 307 || status === 308;
  }

  const WEBDAV_PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>';

  // --- GM XHR wrapper (CORS-free WebDAV) ---
  function SYNC_xhr({ method, url, headers = {}, body = null, responseType = 'text', timeoutMs = 20000 }) {
    return new Promise((resolve, reject) => {
      const gm = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : null;
      if (!gm) return reject(new Error('GM_xmlhttpRequest missing (Tampermonkey @grant required)'));

      gm({
        method,
        url,
        headers,
        data: body,
        responseType,
        timeout: timeoutMs,
        onload: (r) => resolve(r),
        onerror: (e) => reject(e),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function SYNC_basicAuthHeader(user, pass) {
    const u = String(user || '');
    const p = String(pass || '');
    const token = btoa(unescape(encodeURIComponent(`${u}:${p}`)));
    return `Basic ${token}`;
  }

  async function WEBDAV_ensureFolder(creds) {
    const base = creds?.url;
    const root = creds?.root || 'H2O';
    const url0 = SYNC_asCollectionUrl(SYNC_joinUrl(base, root));
    const pass = String(creds?.password || '');

    const auth = SYNC_basicAuthHeader(creds?.username, pass);
    const headersProp = {
      Authorization: auth,
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    };
    const headersMkcol = { Authorization: auth };

    const xhrErr = (e) => ({
      status: Number(e?.status || 0),
      responseText: String(e?.responseText || e?.response || e?.statusText || e?.message || e || ''),
      finalUrl: e?.finalUrl,
      responseURL: e?.responseURL,
    });

    const r1 = await SYNC_xhr({ method: 'PROPFIND', url: url0, headers: headersProp, body: WEBDAV_PROPFIND_BODY }).catch(xhrErr);

    if (WEBDAV_isRedirect(r1.status)) {
      const urlR = SYNC_pickFinalUrl(r1, url0);
      const r1b = await SYNC_xhr({ method: 'PROPFIND', url: urlR, headers: headersProp, body: WEBDAV_PROPFIND_BODY }).catch(xhrErr);
      if (WEBDAV_isOkStatus(r1b.status)) return { ok: true, url: urlR };
      if (WEBDAV_isRedirect(r1b.status)) return { ok: true, url: SYNC_pickFinalUrl(r1b, urlR) };
      return { ok: false, url: urlR, err: r1b.responseText || `PROPFIND failed (${r1b.status || 'no'})` };
    }

    if (WEBDAV_isOkStatus(r1.status)) return { ok: true, url: url0 };

    if (r1.status === 401 || r1.status === 403) {
      return { ok: false, url: url0, err: `Auth/permission failed (${r1.status})` };
    }

    if (r1.status === 404) {
      const r2 = await SYNC_xhr({ method: 'MKCOL', url: url0, headers: headersMkcol }).catch(xhrErr);
      if (WEBDAV_isOkStatus(r2.status) || r2.status === 405) return { ok: true, url: url0 };
      if (WEBDAV_isRedirect(r2.status)) return { ok: true, url: SYNC_pickFinalUrl(r2, url0) };
      return { ok: false, url: url0, err: r2.responseText || `MKCOL failed (${r2.status || 'no'})` };
    }

    const r3 = await SYNC_xhr({ method: 'MKCOL', url: url0, headers: headersMkcol }).catch(xhrErr);
    if (WEBDAV_isOkStatus(r3.status) || r3.status === 405) return { ok: true, url: url0 };
    if (WEBDAV_isRedirect(r3.status)) return { ok: true, url: SYNC_pickFinalUrl(r3, url0) };

    return { ok: false, url: url0, err: (r1.responseText || r3.responseText || `PROPFIND/MKCOL failed (${r1.status || 'no'})`) };
  }

  function fileUrl(creds, filename) {
    return SYNC_joinUrl(creds?.url, creds?.root || 'H2O', filename);
  }

  async function test(creds) {
    if (!creds?.url || !creds?.username || !creds?.password) return { ok: false, status: 0, message: 'missing creds' };

    const folder = await WEBDAV_ensureFolder(creds);
    if (!folder.ok) return { ok: false, status: 0, message: folder.err || 'folder not ready', folderUrl: folder.url };

    const url0 = SYNC_asCollectionUrl(folder.url);
    const headers = {
      Authorization: SYNC_basicAuthHeader(creds.username, creds.password),
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    };

    const xhrErr = (e) => ({
      status: Number(e?.status || 0),
      responseText: String(e?.responseText || e?.response || e?.statusText || e?.message || e || ''),
      finalUrl: e?.finalUrl,
      responseURL: e?.responseURL,
    });

    const r = await SYNC_xhr({ method: 'PROPFIND', url: url0, headers, body: WEBDAV_PROPFIND_BODY }).catch(xhrErr);

    if (WEBDAV_isRedirect(r.status)) {
      const urlR = SYNC_pickFinalUrl(r, url0);
      const r2 = await SYNC_xhr({ method: 'PROPFIND', url: urlR, headers, body: WEBDAV_PROPFIND_BODY }).catch(xhrErr);
      const ok2 = WEBDAV_isOkStatus(r2.status) || WEBDAV_isRedirect(r2.status);
      return { ok: ok2, status: r2.status, message: ok2 ? 'ok' : (r2.responseText || `HTTP ${r2.status}`), folderUrl: SYNC_pickFinalUrl(r2, urlR) };
    }

    const ok = WEBDAV_isOkStatus(r.status);
    return { ok, status: r.status, message: ok ? 'ok' : (r.responseText || `HTTP ${r.status}`), folderUrl: url0 };
  }

  async function putText(creds, filename, text) {
    const folder = await WEBDAV_ensureFolder(creds);
    if (!folder.ok) throw new Error(folder.err || 'folder not ready');
    const url = fileUrl(creds, filename);
    const headers = {
      Authorization: SYNC_basicAuthHeader(creds.username, creds.password),
      'Content-Type': 'application/json; charset=utf-8',
    };
    const r = await SYNC_xhr({ method: 'PUT', url, headers, body: String(text || '') }).catch((e) => { throw new Error(String(e)); });
    if (!(r.status >= 200 && r.status < 300)) throw new Error(`PUT failed (${r.status})${r.responseText ? ': ' + String(r.responseText).slice(0, 300) : ''}`);
    const t = String(text || '');
    return { ok: true, status: r.status, bytes: t.length, hash: await SYNC_sha256(t) };
  }

  async function putJSON(creds, filename, obj) {
    const folder = await WEBDAV_ensureFolder(creds);
    if (!folder.ok) throw new Error(folder.err || 'folder not ready');

    const text = JSON.stringify(obj, null, 2);
    const url = fileUrl(creds, filename);
    const headers = {
      Authorization: SYNC_basicAuthHeader(creds.username, creds.password),
      'Content-Type': 'application/json; charset=utf-8',
    };
    const r = await SYNC_xhr({ method: 'PUT', url, headers, body: text }).catch((e) => { throw new Error(String(e)); });
    if (!(r.status >= 200 && r.status < 300)) throw new Error(`PUT failed (${r.status})${r.responseText ? ': ' + String(r.responseText).slice(0, 300) : ''}`);
    return { ok: true, status: r.status, bytes: text.length, hash: await SYNC_sha256(text) };
  }

  async function getJSON(creds, filename) {
    const url0 = fileUrl(creds, filename);
    const url = url0 + (url0.includes('?') ? '&' : '?') + '_h2ocb=' + Date.now();
    const headers = {
      Authorization: SYNC_basicAuthHeader(creds.username, creds.password),
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };

    const r = await SYNC_xhr({ method: 'GET', url, headers }).catch((e) => { throw new Error(String(e)); });
    if (!(r.status >= 200 && r.status < 300)) throw new Error(`GET failed (${r.status})${r.responseText ? ': ' + String(r.responseText).slice(0, 300) : ''}`);
    const text = String(r.responseText || '');
    const obj = JSON.parse(text || '{}');
    return { ok: true, status: r.status, obj, hash: await SYNC_sha256(text), bytes: text.length };
  }

  function boot() {
    H2O.sync = H2O.sync || {};
    H2O.sync.providers = H2O.sync.providers || {};
    H2O.sync.providers.webdav = H2O.sync.providers.webdav || {};

    const P = H2O.sync.providers.webdav;

    // Non-destructive installs (don't stomp if Sync hot-patched something)
    P.metaVersion = P.metaVersion || VERSION;
    if (!P.fileUrl) P.fileUrl = fileUrl;
    if (!P.test) P.test = test;
    if (!P.putText) P.putText = putText;
    if (!P.putJSON) P.putJSON = putJSON;
    if (!P.getJSON) P.getJSON = getJSON;

    DIAG_step('providers:boot', VERSION);

    try { W.dispatchEvent(new CustomEvent(EV_SYNC_PROVIDERS_READY, { detail: { ok: true, version: VERSION } })); } catch {}
  }

  boot();

})();
