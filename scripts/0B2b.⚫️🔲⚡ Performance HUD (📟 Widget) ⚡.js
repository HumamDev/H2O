// ==UserScript==
// @h2o-id             0b2b.perf.hud
// @name               0B2b.⚫️🔲⚡ Performance HUD (Widget) ⚡
// @namespace          H2O.Premium.CGX.perf.hud
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260331-173500
// @description        Floating performance HUD for H2O. Reads H2O.perf.snapshot(), integrates with Command Bar through public HUD state, pauses when tab hidden, auto-avoids MiniMap collision, and stays outside the conversation tree.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W    = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W.top || W;
  const D    = document;

  /* ─── Identity ───────────────────────────────────────────────────────────── */
  const TOK    = 'PH';
  const PID    = 'prfhud';
  const CID    = 'perfhud';
  const SkID   = 'prfh';
  const MODTAG = 'PerfHUD';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const BrID   = PID;

  const BOOT_KEY  = `${TOK}:${PID}:booted`;
  const NS_DISK   = `h2o:${SUITE}:${HOST}:${PID}`;
  const KEY_OPEN  = `${NS_DISK}:open:v1`;
  const KEY_VIS   = `${NS_DISK}:visible:v1`;
  const KEY_ANCH  = `${NS_DISK}:anchor:v1`;
  const STYLE_ID  = `cgxui-${SkID}-style`;
  const EVT_HUD_READY = 'evt:h2o:perf:hud-ready';
  const EVT_HUD_STATE_CHANGED = 'evt:h2o:perf:hud-statechanged';

  if (TOPW[BOOT_KEY]) return;
  TOPW[BOOT_KEY] = true;

  const H2O   = (TOPW.H2O = TOPW.H2O || {});
  H2O[TOK]    = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta  = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };
  VAULT.state = VAULT.state || {};

  const S = VAULT.state;

  /* ─── Persisted UI state ─────────────────────────────────────────────────── */
  S.root = S.root || null;
  S.bodyEl = S.bodyEl || null;
  S.open = !!readJson(KEY_OPEN, false);
  S.visible = !!readJson(KEY_VIS, true);
  S.anchor = String(readStr(KEY_ANCH, 'tr') || 'tr');
  S.timer = Number(S.timer || 0);
  S.visibilityOff = S.visibilityOff || null;
  S.collisionAnchor = S.collisionAnchor || null;
  S.resizeOff = S.resizeOff || null;

  /* ─── Storage helpers ────────────────────────────────────────────────────── */
  function readStr(key, fallback = '') {
    try { return localStorage.getItem(String(key)) ?? fallback; } catch { return fallback; }
  }

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(String(key));
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(String(key), JSON.stringify(value)); } catch {}
  }

  function writeStr(key, value) {
    try { localStorage.setItem(String(key), String(value)); } catch {}
  }

  /* ─── DOM helpers ────────────────────────────────────────────────────────── */
  function q(sel, root = D) {
    try { return sel ? root.querySelector(sel) : null; } catch { return null; }
  }

  function emitHudStateChanged(reason = 'state') {
    try {
      W.dispatchEvent(new CustomEvent(EVT_HUD_STATE_CHANGED, {
        detail: { reason: String(reason || 'state'), state: API.getState() },
      }));
    } catch {}
  }

  function getPollMs() {
    return S.open ? 1000 : 4000;
  }

  function setOpen(open, reason = 'ui') {
    S.open = !!open;
    if (S.root) S.root.setAttribute('data-open', S.open ? '1' : '0');
    writeJson(KEY_OPEN, S.open);
    restartTimer();
    render();
    emitHudStateChanged(`open:${reason}`);
    return S.open;
  }

  function resetHudCounters(reason = 'reset') {
    try { TOPW.H2O?.perf?.resetCounters?.(); } catch {}
    render();
    emitHudStateChanged(`reset:${reason}`);
    return true;
  }

  function toggleVisible(reason = 'toggle') {
    return S.visible ? hide(reason) : show(reason);
  }

  /* ─── Style injection ────────────────────────────────────────────────────── */
  function injectStyle() {
    if (q(`#${STYLE_ID}`)) return;
    const style = D.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .cgxui-${SkID}-root {
        position: fixed;
        inset: 12px 12px auto auto;
        z-index: 2147483645;
        width: 232px;
        max-width: calc(100vw - 24px);
        background: rgba(14, 17, 24, 0.94);
        color: #dde4f0;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0,0,0,.44), 0 0 0 1px rgba(255,255,255,.04) inset;
        backdrop-filter: blur(12px);
        font: 11.5px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        overflow: hidden;
        user-select: none;
        pointer-events: auto;
        transition: box-shadow 0.15s ease;
      }
      .cgxui-${SkID}-root[data-anchor="tr"] { inset: 12px 12px auto auto; }
      .cgxui-${SkID}-root[data-anchor="tl"] { inset: 12px auto auto 12px; }
      .cgxui-${SkID}-root[data-anchor="br"] { inset: auto 12px 12px auto; }
      .cgxui-${SkID}-root[data-anchor="bl"] { inset: auto auto 12px 12px; }
      .cgxui-${SkID}-root[hidden] { display: none !important; }
      .cgxui-${SkID}-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 6px; padding: 7px 9px;
        background: rgba(255,255,255,0.035);
        border-bottom: 1px solid rgba(255,255,255,0.07);
        cursor: pointer;
      }
      .cgxui-${SkID}-title {
        font-weight: 700; font-size: 11px; letter-spacing: .04em;
        color: rgba(221,228,240,.72); text-transform: uppercase;
      }
      .cgxui-${SkID}-actions { display: flex; gap: 4px; }
      .cgxui-${SkID}-btn {
        appearance: none; border: 0;
        background: rgba(255,255,255,.07); color: #dde4f0;
        width: 20px; height: 20px; border-radius: 5px;
        cursor: pointer; padding: 0; font-size: 11px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
      }
      .cgxui-${SkID}-btn:hover { background: rgba(255,255,255,.14); }
      .cgxui-${SkID}-body { padding: 7px 9px 9px; display: grid; gap: 5px; }
      .cgxui-${SkID}-row {
        display: grid; grid-template-columns: 1fr auto; gap: 8px;
        align-items: center;
      }
      .cgxui-${SkID}-key {
        color: rgba(221,228,240,.58); font-size: 11px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .cgxui-${SkID}-val {
        font-variant-numeric: tabular-nums; font-size: 11px;
        text-align: right; white-space: nowrap;
      }
      .cgxui-${SkID}-val[data-warn="1"] { color: #ffd166; }
      .cgxui-${SkID}-val[data-warn="2"] { color: #ff6b6b; }
      .cgxui-${SkID}-sep {
        height: 1px; background: rgba(255,255,255,0.07); margin: 2px 0;
      }
      .cgxui-${SkID}-root[data-open="0"] .cgxui-${SkID}-more { display: none; }
    `;
    (D.head || D.documentElement).appendChild(style);
  }

  /* ─── Root DOM element ───────────────────────────────────────────────────── */
  function createRoot() {
    if (S.root?.isConnected) return S.root;

    const root = D.createElement('section');
    root.className = `cgxui-${SkID}-root`;
    root.setAttribute('data-cgxui-owner', SkID);
    root.setAttribute('data-cgxui', 'perf-hud');
    root.setAttribute('data-open', S.open ? '1' : '0');
    root.setAttribute('data-anchor', S.anchor || 'tr');
    root.hidden = !S.visible;
    root.innerHTML = `
      <div class="cgxui-${SkID}-head">
        <div class="cgxui-${SkID}-title">H2O Perf</div>
        <div class="cgxui-${SkID}-actions">
          <button type="button" class="cgxui-${SkID}-btn" data-act="anchor" title="Move HUD corner">⇆</button>
          <button type="button" class="cgxui-${SkID}-btn" data-act="reset" title="Reset counters">↺</button>
          <button type="button" class="cgxui-${SkID}-btn" data-act="hide" title="Hide HUD">×</button>
        </div>
      </div>
      <div class="cgxui-${SkID}-body"></div>
    `;

    S.root = root;
    S.bodyEl = root.querySelector(`.cgxui-${SkID}-body`);
    root.querySelector(`.cgxui-${SkID}-head`).addEventListener('click', onHeadClick);
    (D.body || D.documentElement).appendChild(root);
    resolveCollision();
    return root;
  }

  /* ─── Anchor / collision helpers ─────────────────────────────────────────── */
  const ANCHOR_CYCLE = ['tr', 'br', 'bl', 'tl'];

  function nextAnchor(current) {
    const idx = ANCHOR_CYCLE.indexOf(current);
    return ANCHOR_CYCLE[(idx + 1) % ANCHOR_CYCLE.length];
  }

  function mmPanelRect() {
    const mm = q(
      '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"],' +
      '[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"],' +
      '[data-cgxui="mnmp-col"][data-cgxui-owner="mnmp"]'
    );
    if (!mm?.isConnected) return null;
    try { return mm.getBoundingClientRect(); } catch { return null; }
  }

  function rectsOverlap(a, b) {
    if (!a || !b) return false;
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  function hudRect(root) {
    if (!root?.isConnected) return null;
    try { return root.getBoundingClientRect(); } catch { return null; }
  }

  function resolveCollision() {
    const root = S.root;
    if (!root?.isConnected) return;

    const mmRect = mmPanelRect();
    if (!mmRect) return;

    let anchor = S.anchor || 'tr';
    let tries = 0;
    while (tries < ANCHOR_CYCLE.length) {
      root.setAttribute('data-anchor', anchor);
      if (!rectsOverlap(hudRect(root), mmRect)) break;
      anchor = nextAnchor(anchor);
      tries += 1;
    }

    if (anchor !== S.anchor) {
      S.anchor = anchor;
      writeStr(KEY_ANCH, anchor);
    }
  }

  /* ─── Head click handler ─────────────────────────────────────────────────── */
  function onHeadClick(e) {
    const act = String(e?.target?.getAttribute?.('data-act') || '').trim();

    if (act === 'hide') {
      e.preventDefault(); e.stopPropagation();
      hide('head');
      return;
    }

    if (act === 'anchor') {
      e.preventDefault(); e.stopPropagation();
      S.anchor = nextAnchor(S.anchor || 'tr');
      if (S.root) S.root.setAttribute('data-anchor', S.anchor);
      writeStr(KEY_ANCH, S.anchor);
      emitHudStateChanged('anchor:head');
      return;
    }

    if (act === 'reset') {
      e.preventDefault(); e.stopPropagation();
      resetHudCounters('head');
      return;
    }

    setOpen(!S.open, 'head');
  }

  /* ─── Snapshot access ────────────────────────────────────────────────────── */
  function perfSnapshot() {
    try { return TOPW.H2O?.perf?.snapshot?.() || null; } catch { return null; }
  }

  /* ─── Value formatters ───────────────────────────────────────────────────── */
  function fmtMB(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    return `${Number(v).toFixed(1)} MB`;
  }

  function fmtInt(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    return new Intl.NumberFormat().format(Number(v));
  }

  function fmtMs(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    return `${Number(v).toFixed(1)} ms`;
  }

  function fmtDualMs(last, avg) {
    const a = fmtMs(last);
    const b = fmtMs(avg);
    if (a === '—' && b === '—') return '—';
    if (b === '—') return a;
    if (a === '—') return `avg ${b}`;
    return `${a} / ${b}`;
  }

  function fmtPair(a, b, sep = ' / ') {
    const aa = (a == null || a === '') ? '—' : String(a);
    const bb = (b == null || b === '') ? '—' : String(b);
    return `${aa}${sep}${bb}`;
  }

  function fmtPage(page) {
    if (!page || page.enabled === false) return 'off';
    const idx = Number(page.pageIndex || 0) + 1;
    const total = Number(page.pageCount || 0);
    return total ? `${idx} / ${total}` : '—';
  }

  function heapWarn(mb) {
    if (mb == null) return '0';
    if (mb > 500) return '2';
    if (mb > 300) return '1';
    return '0';
  }

  function domWarn(count) {
    if (count == null) return '0';
    if (count > 20000) return '2';
    if (count > 10000) return '1';
    return '0';
  }

  function msWarn(ms, warn = 16, hard = 50) {
    if (ms == null) return '0';
    const n = Number(ms);
    if (!Number.isFinite(n)) return '0';
    if (n >= hard) return '2';
    if (n >= warn) return '1';
    return '0';
  }

  /* ─── Row builder ────────────────────────────────────────────────────────── */
  function buildRows(snap) {
    if (!snap) return [['—', '—']];

    const mm = snap.minimap || {};
    const rebuilds = mm.rebuilds || {};
    const hub = snap.observerHub?.stats || {};
    const hubVolume = snap.observerHub?.volume || {};
    const um = snap.unmount || {};
    const umTiming = um.timing || {};
    const pgTiming = snap.pagination?.timing || {};
    const gv = snap.governor || {};
    const profile = gv.state?.lastProfile || gv.resolved?.profileName || null;
    const longTasks = snap.longTasks || {};
    const lag = snap.eventLoopLag || {};

    const base = [
      ['Heap', fmtMB(snap.heapUsedMB), heapWarn(snap.heapUsedMB)],
      ['DOM chat', fmtInt(snap.conversationDomNodes ?? snap.domNodes), domWarn(snap.conversationDomNodes ?? snap.domNodes)],
      ['Page', fmtPage(snap.page)],
      ['Snap', fmtMs(snap.snapshotMs), msWarn(snap.snapshotMs, 8, 20)],
    ];

    if (!S.open) return base;

    return base.concat([
      null,
      ['Turns', fmtInt(snap.turns?.total)],
      ['Peak heap', fmtMB(snap.peakHeapMB), heapWarn(snap.peakHeapMB)],
      ['Peak DOM', fmtInt(snap.peakConversationDomNodes), domWarn(snap.peakConversationDomNodes)],
      ['Lag', fmtDualMs(lag.lastLagMs, lag.avgLagMs), msWarn(lag.lastLagMs, 12, 40)],
      ['Long tasks', fmtPair(longTasks.count ?? null, `${Math.round((Number(longTasks.windowMs || 0) / 1000) || 0)}s`), msWarn(longTasks.lastMs, 50, 120)],
      ['Last LT', fmtMs(longTasks.lastMs), msWarn(longTasks.lastMs, 50, 120)],
      ['CmdBar geom', fmtMs(snap.commandBarGeometryMs), msWarn(snap.commandBarGeometryMs, 4, 12)],
      null,
      ['MM core', fmtDualMs(rebuilds.lastCoreMs, rebuilds.avgCoreMs), msWarn(rebuilds.lastCoreMs, 8, 24)],
      ['MM eng', fmtDualMs(rebuilds.lastEngineMs, rebuilds.avgEngineMs), msWarn(rebuilds.lastEngineMs, 8, 24)],
      ['Pagination', fmtDualMs(pgTiming.lastRenderMs, pgTiming.avgRenderMs), msWarn(pgTiming.lastRenderMs, 12, 30)],
      ['Unmount', fmtDualMs(umTiming.lastPassMs, umTiming.avgPassMs), msWarn(umTiming.lastPassMs, 12, 30)],
      ['UM hidden', fmtPair(umTiming.lastHiddenBefore ?? null, umTiming.lastHiddenAfter ?? null, ' → ')],
      null,
      ['Hub flushes', fmtInt(hub.counts?.deliveredFlushes)],
      ['Hub batches', fmtInt(hubVolume.rawBatchCount)],
      ['Hub nodes', fmtPair(fmtInt(hubVolume.addedCount), fmtInt(hubVolume.removedCount), ' / ')],
      profile ? ['Profile', profile] : null,
    ]);
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  function render() {
    const root = createRoot();
    if (!root) return;

    root.hidden = !S.visible;
    root.setAttribute('data-open', S.open ? '1' : '0');
    root.setAttribute('data-anchor', S.anchor || 'tr');

    if (!S.visible) return;

    const snap = perfSnapshot();
    const rows = buildRows(snap);
    let visibleIndex = 0;
    S.bodyEl.innerHTML = rows.map((row) => {
      if (row === null) {
        const cls = visibleIndex >= 4 ? ` cgxui-${SkID}-more` : '';
        return `<div class="cgxui-${SkID}-sep${cls}"></div>`;
      }
      const [label, value, warn = '0'] = row;
      const cls = visibleIndex >= 4 ? ` cgxui-${SkID}-more` : '';
      visibleIndex += 1;
      return `<div class="cgxui-${SkID}-row${cls}">` +
        `<div class="cgxui-${SkID}-key">${label}</div>` +
        `<div class="cgxui-${SkID}-val" data-warn="${warn}">${value}</div>` +
        `</div>`;
    }).join('');
  }

  /* ─── Timer — real hidden-tab pause ─────────────────────────────────────── */
  function stopTimer() {
    if (!S.timer) return;
    try { clearInterval(S.timer); } catch {}
    S.timer = 0;
  }

  function restartTimer() {
    stopTimer();
    if (!S.visible || D.hidden) return;
    const ms = getPollMs();
    S.timer = W.setInterval(() => {
      render();
    }, ms);
  }

  function bindVisibilityListener() {
    if (S.visibilityOff) return;
    const handler = () => {
      if (D.hidden) {
        stopTimer();
        emitHudStateChanged('visibility:hidden');
        return;
      }
      render();
      restartTimer();
      emitHudStateChanged('visibility:visible');
    };
    D.addEventListener('visibilitychange', handler, { passive: true });
    S.visibilityOff = () => {
      try { D.removeEventListener('visibilitychange', handler, { passive: true }); } catch {}
      try { D.removeEventListener('visibilitychange', handler); } catch {}
    };
  }

  /* ─── Show / hide ────────────────────────────────────────────────────────── */
  function show(reason = 'show') {
    S.visible = true;
    writeJson(KEY_VIS, true);
    render();
    restartTimer();
    emitHudStateChanged(`show:${reason}`);
    return true;
  }

  function hide(reason = 'hide') {
    S.visible = false;
    writeJson(KEY_VIS, false);
    if (S.root) S.root.hidden = true;
    stopTimer();
    emitHudStateChanged(`hide:${reason}`);
    return true;
  }

  /* ─── Resize listener ────────────────────────────────────────────────────── */
  function bindResizeListener() {
    if (S.resizeOff) return;
    const handler = () => resolveCollision();
    W.addEventListener('resize', handler, { passive: true });
    S.resizeOff = () => W.removeEventListener('resize', handler);
  }

  /* ─── Boot ───────────────────────────────────────────────────────────────── */
  function boot() {
    injectStyle();
    createRoot();
    render();
    bindResizeListener();
    bindVisibilityListener();
    restartTimer();
    try { W.dispatchEvent(new CustomEvent(EVT_HUD_READY, { detail: { state: API.getState() } })); } catch {}
    emitHudStateChanged('boot');
  }

  /* ─── Public API ─────────────────────────────────────────────────────────── */
  const API = {
    ver: '1.2.0',
    boot,
    show,
    hide,
    toggle: toggleVisible,
    setOpen,
    reset: resetHudCounters,
    render,
    getState: () => ({
      open: !!S.open,
      visible: !!S.visible,
      anchor: String(S.anchor || 'tr'),
      pollMs: getPollMs(),
      hidden: !!D.hidden,
    }),
  };

  VAULT.api = API;
  H2O.perf = H2O.perf || {};
  H2O.perf.hud = API;

  const wakeEvents = [
    'evt:h2o:minimap:engine-ready',
    'evt:h2o:minimap:shell-ready',
    'evt:h2o:obs:ready',
    'evt:h2o:core:ready',
  ];
  for (const ev of wakeEvents) {
    try {
      W.addEventListener(ev, () => {
        render();
        resolveCollision();
      }, { passive: true });
    } catch {}
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
