// ==H2O Module==
// @h2o-id             3x1c.capture.mirror
// @name               3X1c.🟧🧷 Capture Mirror 🧷
// @namespace          H2O.Premium.CGX.capture.mirror
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260528-000001
// @description        F10.5.3 — count-safe capture mirror. Aggregates the per-chat Capture stores the Capture Engine (3X1a) writes to page localStorage into a counts/hashes-only digest and pushes it through the existing h2o-ext-cs page→content bridge so the content script can mirror it into chrome.storage.local (and forward it to the standalone Studio Launcher). Read-only over capture data; never copies chat text/titles/tags/ids.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

/* F10.5.3 — Native capture mirror (page world, count-safe).
 *
 * WHY: 3X1a Capture writes per-chat stores to chatgpt.com page
 * localStorage. Standalone Chrome Studio runs at chrome-extension://
 * and cannot read that origin's localStorage. This module mirrors a
 * count-safe DIGEST (counts + sha256 hashes only — never raw item text,
 * titles, tags, ids, or raw chatId) into chrome.storage.local via the
 * already-shipped h2o-ext-cs page→content bridge (same transport 0F1h
 * Library Sync uses), so the loader content script can persist it and
 * cross-extension-forward it to the Studio Launcher.
 *
 * SAFETY:
 *   - Read-only over capture data. No localStorage writes here.
 *   - Reads only item.status / pinned / kind / createdAt / updatedAt.
 *   - chatId is SHA-256 hashed (Web Crypto); raw chatId/itemId never
 *     leave this module. itemId is not included even hashed.
 *   - A forever-no key guard runs on the digest before every emit.
 *   - Event-driven + debounced; no polling of capture data.
 */
(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = document;

  /* Idempotency — never install twice. */
  if (W.__H2O_CAPTURE_MIRROR_INSTALLED__) return;
  W.__H2O_CAPTURE_MIRROR_INSTALLED__ = true;

  // ── Constants ───────────────────────────────────────────────────────
  const STORE_PREFIX = 'h2o:prm:cgx:capture:store:v1:'; // 3X1a keyStore shape
  const MIRROR_KEY = 'h2o:prm:cgx:capture:mirror:v1';
  const MIRROR_SCHEMA = 'h2o.prm.cgx.capture.mirror.v1';
  const VERSION = '1.0.0-f10.5.3';
  const KIND_TEXT_BUCKET = 'text'; // 3X1a default item.kind; value only, never a key
  const CHANGE_EVENT = 'h2o:capture:changed'; // 3X1a EV.changed
  const MAX_CHATS = 5000;

  // h2o-ext-cs page→content bridge (verbatim from chrome-live-loader.mjs).
  const BRIDGE_WRITE = 'h2o-ext-cs:v1:write';
  const EV_WRITE = 'h2o-ext-cs:write';
  const BRIDGE_PROBE = 'h2o-ext-cs:v1:probe';
  const EV_PROBE = 'h2o-ext-cs:probe';
  const BRIDGE_READY = 'h2o-ext-cs:v1:ready';
  const EV_READY = 'h2o-ext-cs:ready';

  // Debounce: trailing window + hard max wait so bursts coalesce but a
  // long stream of edits still flushes within MAX_WAIT_MS.
  const DEBOUNCE_MS = 750;
  const MAX_WAIT_MS = 5000;

  // Forever-no field names (F10.2.0 §5.3). Digest is built by hand from
  // count fields only; this guard is defense-in-depth before every emit.
  const FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey',
  ];

  // ── Small self-contained helpers (no imports; scan-clean) ───────────
  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function epochMsToIsoSeconds(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return null;
    try { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'); }
    catch (_) { return null; }
  }
  function webCryptoAvailable() {
    try { return !!(W.crypto && W.crypto.subtle && W.crypto.subtle.digest); }
    catch (_) { return false; }
  }
  function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i].toString(16);
      hex += b.length === 1 ? '0' + b : b;
    }
    return hex;
  }
  async function sha256Hex(input) {
    if (!webCryptoAvailable()) return '';
    const data = (typeof input === 'string')
      ? new TextEncoder().encode(input)
      : new TextEncoder().encode(String(input));
    const buf = await W.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buf));
  }
  function isSha256Hex(s) {
    return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  }

  // Walk the digest tree; return the first forever-no / *Token key found
  // (excluding the literal 'previewToken'), else null.
  function digestHasForbiddenKey(obj) {
    if (obj == null || typeof obj !== 'object') return null;
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      if (Array.isArray(cur)) { for (let i = 0; i < cur.length; i++) stack.push(cur[i]); continue; }
      if (cur != null && typeof cur === 'object') {
        const keys = Object.keys(cur);
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j];
          if (FOREVER_NO_FIELDS.indexOf(k) !== -1) return k;
          if (k !== 'previewToken' && /token$/i.test(k)) return k;
          stack.push(cur[k]);
        }
      }
    }
    return null;
  }

  // ── Count-safe aggregation over page localStorage ───────────────────
  // Reads ONLY status / pinned / kind / createdAt / updatedAt per item.
  function aggregate() {
    let ls;
    try { ls = W.localStorage; } catch (_) { return null; }
    if (!ls || typeof ls.key !== 'function') return null;
    let total;
    try { total = ls.length; } catch (_) { return null; }

    const agg = {
      captureStoreVersion: null,
      totalItemCount: 0,
      pinnedCount: 0,
      itemsByStatus: { new: 0, reviewed: 0, archived: 0, converted: 0, dismissed: 0, other: 0 },
      itemsByKindBucket: { captureSnippetKind: 0, otherKind: 0 },
      earliestCreatedAt: null,
      latestUpdatedAt: null,
      chatIds: [],
    };

    for (let i = 0; i < total; i++) {
      if (agg.chatIds.length >= MAX_CHATS) break;
      let key;
      try { key = ls.key(i); } catch (_) { continue; }
      if (typeof key !== 'string' || key.indexOf(STORE_PREFIX) !== 0) continue;
      const chatId = key.slice(STORE_PREFIX.length);
      if (!chatId) continue;
      let raw;
      try { raw = ls.getItem(key); } catch (_) { continue; }
      if (raw == null) continue;
      let store;
      try { store = JSON.parse(raw); } catch (_) { continue; }
      if (!store || typeof store !== 'object') continue;

      agg.chatIds.push(chatId);
      if (agg.captureStoreVersion === null && typeof store.version === 'number') {
        agg.captureStoreVersion = store.version;
      }
      const items = Array.isArray(store.items) ? store.items : [];
      for (let j = 0; j < items.length; j++) {
        const it = items[j] || {};
        agg.totalItemCount += 1;
        const st = typeof it.status === 'string' ? it.status : '';
        if (st === 'new' || st === 'reviewed' || st === 'archived' || st === 'converted' || st === 'dismissed') {
          agg.itemsByStatus[st] += 1;
        } else {
          agg.itemsByStatus.other += 1;
        }
        if (it.pinned === true) agg.pinnedCount += 1;
        const kind = typeof it.kind === 'string' ? it.kind : '';
        if (kind === KIND_TEXT_BUCKET) agg.itemsByKindBucket.captureSnippetKind += 1;
        else agg.itemsByKindBucket.otherKind += 1;
        const c = (typeof it.createdAt === 'number' && isFinite(it.createdAt) && it.createdAt > 0) ? it.createdAt : null;
        const u = (typeof it.updatedAt === 'number' && isFinite(it.updatedAt) && it.updatedAt > 0) ? it.updatedAt : null;
        if (c !== null && (agg.earliestCreatedAt === null || c < agg.earliestCreatedAt)) agg.earliestCreatedAt = c;
        if (u !== null && (agg.latestUpdatedAt === null || u > agg.latestUpdatedAt)) agg.latestUpdatedAt = u;
      }
    }
    return agg;
  }

  // ── Build the count-safe digest (chatId hashed via SHA-256) ─────────
  async function buildDigest() {
    const agg = aggregate();
    if (!agg) return null;

    const perChatHashes = [];
    for (let i = 0; i < agg.chatIds.length; i++) {
      const h = await sha256Hex(agg.chatIds[i]);
      if (isSha256Hex(h)) perChatHashes.push(h);
    }
    perChatHashes.sort();
    const chatsObservedHash = perChatHashes.length
      ? await sha256Hex(JSON.stringify(perChatHashes))
      : await sha256Hex('h2o.f10.5.no-chats-observed');

    return {
      schema: MIRROR_SCHEMA,
      mirrorVersion: 1,
      captureStoreVersion: agg.captureStoreVersion != null ? agg.captureStoreVersion : 0,
      updatedAtIso: nowIsoSeconds(),
      chatsObservedCount: agg.chatIds.length,
      totalItemCount: agg.totalItemCount,
      itemsByStatus: {
        new: agg.itemsByStatus.new,
        reviewed: agg.itemsByStatus.reviewed,
        archived: agg.itemsByStatus.archived,
        converted: agg.itemsByStatus.converted,
        dismissed: agg.itemsByStatus.dismissed,
        other: agg.itemsByStatus.other,
      },
      pinnedCount: agg.pinnedCount,
      itemsByKindBucket: {
        captureSnippetKind: agg.itemsByKindBucket.captureSnippetKind,
        otherKind: agg.itemsByKindBucket.otherKind,
      },
      timestampRangeIso: {
        earliestCreatedAtIso: epochMsToIsoSeconds(agg.earliestCreatedAt),
        latestUpdatedAtIso: epochMsToIsoSeconds(agg.latestUpdatedAt),
      },
      chatsObservedHash: chatsObservedHash,
    };
  }

  // Stable signature EXCLUDING the volatile updatedAtIso, so an unchanged
  // capture state does not produce a fresh write each time.
  function stableSig(d) {
    return JSON.stringify({
      mv: d.mirrorVersion,
      csv: d.captureStoreVersion,
      c: d.chatsObservedCount,
      t: d.totalItemCount,
      s: d.itemsByStatus,
      p: d.pinnedCount,
      k: d.itemsByKindBucket,
      tr: d.timestampRangeIso,
      h: d.chatsObservedHash,
    });
  }

  // ── Bridge emit (postMessage + document CustomEvent, like 0F1h) ─────
  function emit(digest) {
    const t = Date.now();
    try { W.postMessage({ type: BRIDGE_WRITE, key: MIRROR_KEY, value: digest, t: t }, '*'); } catch (_) {}
    try { D.dispatchEvent(new CustomEvent(EV_WRITE, { detail: { key: MIRROR_KEY, value: digest, t: t } })); } catch (_) {}
    lastEmitAtIso = nowIsoSeconds();
  }

  let lastSig = null;
  let lastDigest = null;
  let lastEmitAtIso = null;

  async function run() {
    let digest;
    try { digest = await buildDigest(); } catch (_) { return; }
    if (!digest) return;
    const sig = stableSig(digest);
    if (sig === lastSig) return; // unchanged capture state — skip write
    if (digestHasForbiddenKey(digest)) {
      try { console.warn('[H2O capture-mirror] forbidden key in digest — refusing emit'); } catch (_) {}
      return;
    }
    lastSig = sig;
    lastDigest = digest;
    emit(digest);
  }

  // ── Debounce (trailing + max-wait) ──────────────────────────────────
  let debTimer = null;
  let maxTimer = null;
  function fire() {
    if (debTimer) { clearTimeout(debTimer); debTimer = null; }
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    run();
  }
  function schedule() {
    if (debTimer) clearTimeout(debTimer);
    debTimer = setTimeout(fire, DEBOUNCE_MS);
    if (!maxTimer) maxTimer = setTimeout(fire, MAX_WAIT_MS);
  }

  // ── Bridge readiness gate (re-emit on cs-bridge READY) ──────────────
  // The content-script bridge replays nothing page-ward for our writes;
  // if it became ready after our first emit, re-send the last digest so
  // the freshly-ready listener captures it. Following the 0F1h probe
  // pattern.
  function onBridgeReady() {
    if (lastDigest) emit(lastDigest);
  }
  function sendProbe() {
    const t = Date.now();
    try { W.postMessage({ type: BRIDGE_PROBE, t: t }, '*'); } catch (_) {}
    try { D.dispatchEvent(new CustomEvent(EV_PROBE, { detail: { t: t } })); } catch (_) {}
  }
  function bindBridgeReady() {
    try {
      W.addEventListener('message', (e) => {
        const d = e && e.data;
        if (d && d.type === BRIDGE_READY) onBridgeReady();
      }, false);
    } catch (_) {}
    try { D.addEventListener(EV_READY, () => onBridgeReady(), false); } catch (_) {}
  }

  // ── Subscribe to capture changes ────────────────────────────────────
  function bindCaptureChanges() {
    let usedApi = false;
    let tries = 0;
    (function waitForCaptureApi() {
      try {
        if (W.H2O && W.H2O.Capture && typeof W.H2O.Capture.onChange === 'function') {
          W.H2O.Capture.onChange(schedule);
          usedApi = true;
          return;
        }
      } catch (_) { /* fall through to retry */ }
      if (tries++ < 40) { setTimeout(waitForCaptureApi, 250); }
    })();
    // Canonical same-world event — robust even if the API binds late or
    // the onChange subscription is missed. Debounce coalesces duplicates.
    try { W.addEventListener(CHANGE_EVENT, schedule, false); } catch (_) {}
    return usedApi;
  }

  // ── Public API (so load is observable; mirrors 3X1a's installApi) ───
  function selfTest() {
    return {
      installed: true,
      version: VERSION,
      mirrorKey: MIRROR_KEY,
      schema: MIRROR_SCHEMA,
      webCryptoAvailable: webCryptoAvailable(),
      captureApiPresent: !!(W.H2O && W.H2O.Capture && typeof W.H2O.Capture.onChange === 'function'),
      bridgeWriteType: BRIDGE_WRITE,
      lastEmitAtIso: lastEmitAtIso,
      lastChatsObservedCount: lastDigest ? lastDigest.chatsObservedCount : null,
      lastTotalItemCount: lastDigest ? lastDigest.totalItemCount : null,
      pendingDebounce: !!debTimer,
    };
  }
  function installApi() {
    const api = {
      version: VERSION,
      mirrorKey: MIRROR_KEY,
      schema: MIRROR_SCHEMA,
      selfTest: selfTest,
      // Force an immediate (re)build + emit; returns a Promise. Count-safe.
      run: function () { return run(); },
      // The last emitted count-safe digest (or null). Safe to expose.
      getLastDigest: function () { return lastDigest; },
    };
    W.H2O = W.H2O || {};
    W.H2O.CaptureMirror = W.H2O.CaptureMirror || api;
  }

  // ── Boot ────────────────────────────────────────────────────────────
  function boot() {
    installApi(); // expose H2O.CaptureMirror first so selfTest() is always
                  // callable — even if Web Crypto is unavailable.
    bindBridgeReady();
    if (!webCryptoAvailable()) return; // SHA-256 required to build digests
    sendProbe();
    bindCaptureChanges();
    schedule(); // initial digest after boot
  }

  boot();
})();
