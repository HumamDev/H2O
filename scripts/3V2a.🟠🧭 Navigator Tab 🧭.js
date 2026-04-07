// ==UserScript==
// @h2o-id             3v2a.navigator.tab
// @name               3V2a.🟠🧭 Navigator Tab 🧭
// @namespace          H2O.Premium.CGX.navigator.tab
// @author             OpenAI
// @version            1.0.0
// @description        Dock Panel tab for Navigator / Outline: All, Questions, Answers, Pinned + filter, pin, rename, jump.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  const KEY_BOOT = 'h2o:prm:cgx:navigator:tab:booted';
  const TAB_ID = 'navigator';
  const CSS_ID = 'cgxui-navigator-tab-style';
  const MODES = [
    ['all', 'All'],
    ['questions', 'Questions'],
    ['answers', 'Answers'],
    ['pinned', 'Pinned']
  ];

  const S = {
    booted: false,
    currentCtx: null,
    unSub: null,
    handlersBound: false,
  };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
  }
  function txt(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function waitForDock(maxMs = 8000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = H2O?.DP?.dckpnl?.api || H2O?.Dock || null;
        if (api?.getContract && H2O?.Dock?.registerTab && W.H2ONavigator) return resolve(api);
        if (performance.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }
  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
      .cgxui-nav-wrap{display:flex;flex-direction:column;gap:10px;padding:10px 10px 12px;color:inherit}
      .cgxui-nav-top{display:flex;flex-direction:column;gap:8px}
      .cgxui-nav-modes{display:flex;gap:6px;flex-wrap:wrap}
      .cgxui-nav-chip{appearance:none;border:0;border-radius:999px;padding:6px 10px;font:inherit;cursor:pointer;background:rgba(255,255,255,.08);color:inherit}
      .cgxui-nav-chip[data-state="active"]{background:rgba(255,208,92,.20);box-shadow:inset 0 0 0 1px rgba(255,208,92,.45)}
      .cgxui-nav-filter{width:100%;box-sizing:border-box;border:0;border-radius:10px;padding:9px 10px;background:rgba(255,255,255,.06);color:inherit;font:inherit}
      .cgxui-nav-list{display:flex;flex-direction:column;gap:6px;min-height:60px}
      .cgxui-nav-row{display:flex;align-items:flex-start;gap:8px;padding:8px 9px;border-radius:12px;background:rgba(255,255,255,.04);cursor:pointer;position:relative}
      .cgxui-nav-row[data-selected="1"]{background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
      .cgxui-nav-row.q{margin-top:2px}
      .cgxui-nav-row.a{margin-left:18px}
      .cgxui-nav-row:hover .cgxui-nav-actions{opacity:1}
      .cgxui-nav-twist{width:16px;min-width:16px;text-align:center;opacity:.8;cursor:pointer;user-select:none}
      .cgxui-nav-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
      .cgxui-nav-title{font-size:13px;line-height:1.35;word-break:break-word}
      .cgxui-nav-sub{font-size:11px;opacity:.7}
      .cgxui-nav-badges{display:flex;gap:4px;flex-wrap:wrap}
      .cgxui-nav-badge{font-size:10px;line-height:1;padding:4px 6px;border-radius:999px;background:rgba(255,255,255,.06)}
      .cgxui-nav-actions{display:flex;gap:5px;opacity:.65;transition:opacity .12s ease}
      .cgxui-nav-btn{appearance:none;border:0;background:rgba(255,255,255,.06);color:inherit;border-radius:8px;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px}
      .cgxui-nav-empty{padding:14px 10px;border-radius:12px;background:rgba(255,255,255,.04);opacity:.75}
      .cgxui-nav-pin{opacity:.95}
    `;
    document.head.appendChild(s);
  }

  function badgeHtml(b) {
    const bits = [];
    if (b?.h) bits.push(`<span class="cgxui-nav-badge">🌈 ${b.h}</span>`);
    if (b?.b) bits.push(`<span class="cgxui-nav-badge">⭐ ${b.b}</span>`);
    if (b?.n) bits.push(`<span class="cgxui-nav-badge">🗒️ ${b.n}</span>`);
    if (b?.a) bits.push(`<span class="cgxui-nav-badge">📎 ${b.a}</span>`);
    return bits.join('');
  }

  function renderRows(nodes, state) {
    if (!nodes.length) return `<div class="cgxui-nav-empty">No items found.</div>`;
    const parts = [];
    for (const q of nodes) {
      const rowSel = state.selectedNodeId === q.id ? '1' : '0';
      const collapsed = !!q.collapsed;
      const qTitle = esc(q.title || `Question ${q.turnIndex || ''}`);
      const qSub = q.rawText && q.rawText !== q.title ? `<div class="cgxui-nav-sub">${esc(q.rawText.slice(0, 180))}</div>` : '';
      parts.push(`
        <div class="cgxui-nav-row q" data-node-id="${esc(q.id)}" data-selected="${rowSel}">
          <div class="cgxui-nav-twist" data-act="toggle">${q.answers?.length ? (collapsed ? '▸' : '▾') : '•'}</div>
          <div class="cgxui-nav-main">
            <div class="cgxui-nav-title">${q.pinned ? '<span class="cgxui-nav-pin">📌</span> ' : ''}${qTitle}</div>
            ${qSub}
            <div class="cgxui-nav-badges">${badgeHtml(q.badges)}</div>
          </div>
          <div class="cgxui-nav-actions">
            <button class="cgxui-nav-btn" data-act="pin">${q.pinned ? 'Unpin' : 'Pin'}</button>
            <button class="cgxui-nav-btn" data-act="rename">Rename</button>
            <button class="cgxui-nav-btn" data-act="jump">Jump</button>
          </div>
        </div>`);
      if (!collapsed) {
        for (const a of q.answers || []) {
          const aSel = state.selectedNodeId === a.id ? '1' : '0';
          parts.push(`
            <div class="cgxui-nav-row a" data-node-id="${esc(a.id)}" data-selected="${aSel}">
              <div class="cgxui-nav-twist">↳</div>
              <div class="cgxui-nav-main">
                <div class="cgxui-nav-title">${a.pinned ? '<span class="cgxui-nav-pin">📌</span> ' : ''}${esc(a.title || `Answer ${a.turnIndex || ''}`)}</div>
                <div class="cgxui-nav-badges">${badgeHtml(a.badges)}</div>
              </div>
              <div class="cgxui-nav-actions">
                <button class="cgxui-nav-btn" data-act="pin">${a.pinned ? 'Unpin' : 'Pin'}</button>
                <button class="cgxui-nav-btn" data-act="rename">Rename</button>
                <button class="cgxui-nav-btn" data-act="jump">Jump</button>
              </div>
            </div>`);
        }
      }
    }
    return parts.join('');
  }

  function getFlatNodes(nodes) {
    const out = [];
    for (const n of nodes) {
      out.push(n);
      if (Array.isArray(n.answers)) out.push(...n.answers);
    }
    return out;
  }

  function render(ctx) {
    ensureStyle();
    const engine = W.H2ONavigator;
    if (!ctx?.listEl || !engine) return;
    const state = engine.loadState();
    const nodes = engine.listNodes({ mode: state.mode, filter: state.filter, fuzzy: state.fuzzy });
    ctx.listEl.innerHTML = `
      <div class="cgxui-nav-wrap" data-nav-root="1">
        <div class="cgxui-nav-top">
          <div class="cgxui-nav-modes">
            ${MODES.map(([k, label]) => `<button class="cgxui-nav-chip" data-mode="${k}" data-state="${state.mode === k ? 'active' : ''}">${label}</button>`).join('')}
          </div>
          <input class="cgxui-nav-filter" data-nav-filter="1" value="${esc(state.filter || '')}" placeholder="Filter questions, answers, aliases…" />
        </div>
        <div class="cgxui-nav-list">${renderRows(nodes, state)}</div>
      </div>`;
    S.currentCtx = { ctx, flatNodes: getFlatNodes(nodes) };
    bindDomHandlers(ctx.listEl, engine);
  }

  function rerender(reason = 'manual') {
    if (!S.currentCtx?.ctx) return;
    const ctx = S.currentCtx.ctx;
    render(ctx);
    try { ctx.api?.requestRender?.(); } catch {}
  }

  function selectedIndex(flat, state) {
    const id = state.selectedNodeId || '';
    const idx = flat.findIndex((n) => n.id === id);
    return idx >= 0 ? idx : 0;
  }

  function bindDomHandlers(root, engine) {
    if (!root || root.__h2oNavigatorBound) return;
    root.__h2oNavigatorBound = 1;

    root.addEventListener('click', async (ev) => {
      const modeBtn = ev.target.closest?.('[data-mode]');
      if (modeBtn) {
        engine.patchState({ mode: modeBtn.getAttribute('data-mode'), selectedNodeId: '' }, 'mode');
        render(S.currentCtx.ctx);
        return;
      }

      const row = ev.target.closest?.('.cgxui-nav-row[data-node-id]');
      if (!row) return;
      const nodeId = row.getAttribute('data-node-id');
      const node = engine.getNodeById(nodeId);
      if (!node) return;

      const act = ev.target.closest?.('[data-act]')?.getAttribute?.('data-act') || '';
      if (act === 'toggle') {
        if (node.kind === 'question') engine.toggleCollapsed(node.turnId);
        render(S.currentCtx.ctx);
        return;
      }
      if (act === 'pin') {
        engine.togglePin(node);
        render(S.currentCtx.ctx);
        return;
      }
      if (act === 'rename') {
        const next = prompt('Navigator label', node.title || '');
        if (next !== null) {
          engine.renameNode(node, next);
          render(S.currentCtx.ctx);
        }
        return;
      }
      engine.patchState({ selectedNodeId: node.id }, 'select');
      render(S.currentCtx.ctx);
      await engine.jumpToNode(node, { flash: true });
    }, true);

    root.addEventListener('input', (ev) => {
      const inp = ev.target.closest?.('[data-nav-filter="1"]');
      if (!inp) return;
      engine.patchState({ filter: inp.value || '' }, 'filter');
      render(S.currentCtx.ctx);
    }, true);

    root.addEventListener('keydown', async (ev) => {
      const engineNow = W.H2ONavigator;
      if (!engineNow) return;
      const state = engineNow.loadState();
      const flat = S.currentCtx?.flatNodes || [];
      if (!flat.length) return;
      let idx = selectedIndex(flat, state);
      let handled = false;
      if (ev.key === 'ArrowDown') { idx = Math.min(flat.length - 1, idx + 1); handled = true; }
      else if (ev.key === 'ArrowUp') { idx = Math.max(0, idx - 1); handled = true; }
      else if (ev.key === 'Enter') { handled = true; await engineNow.jumpToNode(flat[idx], { flash: true }); }
      else if (ev.key.toLowerCase() === 'p') { handled = true; engineNow.togglePin(flat[idx]); }
      else if (ev.key.toLowerCase() === 'r') { handled = true; const next = prompt('Navigator label', flat[idx].title || ''); if (next !== null) engineNow.renameNode(flat[idx], next); }
      else if (ev.key === 'ArrowLeft' && flat[idx]?.kind === 'question') { handled = true; engineNow.toggleCollapsed(flat[idx].turnId); }
      else if (ev.key === 'ArrowRight' && flat[idx]?.kind === 'question' && flat[idx]?.collapsed) { handled = true; engineNow.toggleCollapsed(flat[idx].turnId); }
      else if (/^[1-4]$/.test(ev.key)) { handled = true; engineNow.patchState({ mode: MODES[Number(ev.key) - 1][0], selectedNodeId: '' }, 'mode'); }
      if (handled) {
        ev.preventDefault();
        const target = flat[idx] || flat[0];
        if (target) engineNow.patchState({ selectedNodeId: target.id }, 'kbd');
        render(S.currentCtx.ctx);
      }
    }, true);
  }

  function register() {
    const Dock = H2O.Dock || H2O.PanelSide || null;
    if (!Dock?.registerTab || !W.H2ONavigator) return false;
    if (Dock.tabs?.[TAB_ID]?.h2oNavigatorTab) return true;
    Dock.registerTab(TAB_ID, {
      title: 'Navigator',
      h2oNavigatorTab: true,
      render,
    });
    return true;
  }

  function boot() {
    if (S.booted || W[KEY_BOOT]) return;
    W[KEY_BOOT] = 1;
    S.booted = true;
    waitForDock().then((api) => {
      if (!api) return;
      const loop = () => {
        if (register()) return;
        requestAnimationFrame(loop);
      };
      loop();
      S.unSub = W.H2ONavigator?.subscribe?.(() => rerender('engine')) || null;
    });
  }

  boot();
})();
