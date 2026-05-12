// ==UserScript==
// @h2o-id             s0x1a.command_bar.studio
// @name               S0X1a. 🎬 Command Bar - Studio
// @namespace          H2O.Premium.CGX.command_bar.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000022
// @description        Studio Command Bar: premium command palette accessible via Cmd/Ctrl+K. Reads command groups registered on the surface command-bar service (S0F0a). Library Maintenance group is auto-discovered. Designed as system-control surface — diagnostic, repair, override, recovery commands — never user workflow shortcuts.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0X1a Command Bar (Studio)', Date.now());

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 15 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  // ── Service accessors ──────────────────────────────────────────────────────
  function getCore()    { return H2O.LibraryCore || null; }
  function getCmdBar()  { return getCore()?.getService?.('command-bar') || null; }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function el(tag, attrs = {}, children) {
    const node = D.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'on' && v && typeof v === 'object') { for (const [ev, fn] of Object.entries(v)) if (typeof fn === 'function') node.addEventListener(ev, fn); }
      else if (k === 'data' && v && typeof v === 'object') { for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv); }
      else node.setAttribute(k, String(v));
    }
    if (children != null) for (const c of (Array.isArray(children) ? children : [children])) {
      if (c == null || c === false) continue;
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(D.createTextNode(String(c)));
    }
    return node;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    overlay: null,
    list: null,
    input: null,
    open: false,
    query: '',
    items: [],         // flattened { groupId, groupLabel, id, label, fn, hint }
    filtered: [],
    cursor: 0,
    statusEl: null,
  };

  // ── Discover commands from the surface command-bar service ─────────────────
  function discoverItems() {
    const cb = getCmdBar();
    if (!cb || typeof cb.listGroups !== 'function') return [];
    const items = [];
    for (const gid of cb.listGroups()) {
      const group = cb.getGroup(gid);
      if (!group) continue;
      const controls = Array.isArray(group.controls) ? group.controls : [];
      for (const c of controls) {
        items.push({
          groupId: gid,
          groupLabel: group.label || gid,
          groupIcon: group.icon || '',
          id: c.id || '',
          label: c.label || c.id || '',
          hint: c.hint || '',
          fn: typeof c.fn === 'function' ? c.fn : null,
        });
      }
    }
    return items;
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function filter(items, q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return items.slice();
    // Lightweight fuzzy: each char of needle must appear in order. Score by
    // contiguous match bonus + start-of-word bonus.
    const score = (label) => {
      const target = String(label || '').toLowerCase();
      let ti = 0, score = 0, lastHit = -2, streak = 0;
      for (let ni = 0; ni < needle.length; ni++) {
        const ch = needle[ni];
        while (ti < target.length && target[ti] !== ch) ti++;
        if (ti >= target.length) return -1;
        if (ti === 0 || /\s|[^a-z0-9]/.test(target[ti - 1])) score += 4; // start-of-word
        if (ti === lastHit + 1) { streak++; score += 2 + streak; } else { streak = 0; }
        lastHit = ti;
        ti++;
        score += 1;
      }
      return score;
    };
    return items
      .map((item) => ({ item, s: score(`${item.groupLabel} ${item.label}`) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ item }) => item);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (!state.overlay) return;
    state.filtered = filter(state.items, state.query);
    state.cursor = Math.min(state.cursor, Math.max(0, state.filtered.length - 1));

    // List
    state.list.innerHTML = '';
    if (state.filtered.length === 0) {
      state.list.appendChild(el('div', { class: 'wbCmdBarEmpty' }, [
        el('div', { class: 'wbCmdBarEmptyTitle' }, state.query ? 'No commands match' : 'No commands registered'),
        el('div', { class: 'wbCmdBarEmptySub' }, state.query
          ? 'Try a different query, or clear the input.'
          : 'Library Maintenance and other modules will appear here when ready.'),
      ]));
      return;
    }
    let lastGroup = '';
    state.filtered.forEach((item, i) => {
      if (item.groupId !== lastGroup) {
        lastGroup = item.groupId;
        state.list.appendChild(el('div', { class: 'wbCmdBarGroupHead' }, [
          item.groupIcon ? el('span', { class: 'wbCmdBarGroupIcon' }, item.groupIcon) : null,
          el('span', { class: 'wbCmdBarGroupLabel' }, item.groupLabel),
        ]));
      }
      const row = el('button', {
        type: 'button',
        class: `wbCmdBarItem${i === state.cursor ? ' is-active' : ''}`,
        data: { groupId: item.groupId, id: item.id, idx: String(i) },
        on: {
          click: () => execute(item),
          mouseenter: () => { state.cursor = i; updateCursor(); },
        },
      }, [
        el('div', { class: 'wbCmdBarItemMain' }, [
          el('div', { class: 'wbCmdBarItemLabel' }, item.label),
          item.hint ? el('div', { class: 'wbCmdBarItemHint' }, item.hint) : null,
        ]),
        el('div', { class: 'wbCmdBarItemSub' }, item.groupLabel),
      ]);
      state.list.appendChild(row);
    });
  }

  function updateCursor() {
    if (!state.list) return;
    const rows = state.list.querySelectorAll('.wbCmdBarItem');
    rows.forEach((r, i) => r.classList.toggle('is-active', i === state.cursor));
    const active = rows[state.cursor];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // ── Execute ────────────────────────────────────────────────────────────────
  async function execute(item) {
    if (!item || typeof item.fn !== 'function') {
      setStatus('warn', `${item?.label || 'Command'} has no executable function`);
      return;
    }
    setStatus('loading', `Running: ${item.label}…`);
    let result;
    try {
      result = await item.fn();
      // Always log to console for inspection.
      try { console.log(`[H2O Command Bar] ${item.groupLabel} · ${item.label}`, result); } catch {}
      setStatus('ok', `Done: ${item.label}`);
    } catch (e) {
      err(`exec:${item.id}`, e);
      try { console.warn('[H2O Command Bar] command failed:', item.id, e); } catch {}
      setStatus('err', `Failed: ${item.label} — ${String(e?.message || e)}`);
    }
    // Keep overlay open so the operator can chain commands. Esc/clickaway closes.
  }

  function setStatus(kind, text) {
    if (!state.statusEl) return;
    state.statusEl.dataset.kind = String(kind || 'idle');
    state.statusEl.textContent = String(text || '');
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function open() {
    if (state.open) return;
    if (!state.overlay) build();
    state.items = discoverItems();
    state.query = '';
    if (state.input) state.input.value = '';
    state.cursor = 0;
    state.overlay.hidden = false;
    state.open = true;
    state.overlay.dataset.open = '1';
    D.body?.setAttribute('data-cmdbar-open', '1');
    setStatus('idle', `${state.items.length} commands available · Cmd/Ctrl+K to toggle · Esc to close`);
    render();
    // Defer focus into the next microtask so the open animation doesn't steal it.
    queueMicrotask(() => state.input?.focus());
    step('open', String(state.items.length));
  }
  function close() {
    if (!state.open || !state.overlay) return;
    state.overlay.hidden = true;
    state.overlay.removeAttribute('data-open');
    D.body?.removeAttribute('data-cmdbar-open');
    state.open = false;
    step('close');
  }
  function toggle() { state.open ? close() : open(); }

  // ── Build overlay (once) ───────────────────────────────────────────────────
  function build() {
    const overlay = el('div', { class: 'wbCmdBar', id: 'wbCmdBar', hidden: 'true', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command Bar' });
    const backdrop = el('div', { class: 'wbCmdBarBackdrop', on: { click: () => close() } });
    const panel = el('div', { class: 'wbCmdBarPanel', role: 'combobox' });

    const head = el('header', { class: 'wbCmdBarHead' }, [
      el('span', { class: 'wbCmdBarHeadIcon', html: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="11" cy="11" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m15.1 15.1 3.15 3.15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' }),
      el('input', {
        type: 'search', class: 'wbCmdBarInput', placeholder: 'Search system commands…',
        autocomplete: 'off', spellcheck: 'false',
        on: {
          input: (ev) => { state.query = String(ev.target.value || ''); state.cursor = 0; render(); },
          keydown: (ev) => {
            if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
            if (ev.key === 'ArrowDown') { ev.preventDefault(); state.cursor = Math.min(state.filtered.length - 1, state.cursor + 1); updateCursor(); return; }
            if (ev.key === 'ArrowUp')   { ev.preventDefault(); state.cursor = Math.max(0, state.cursor - 1); updateCursor(); return; }
            if (ev.key === 'Enter')      { ev.preventDefault(); const pick = state.filtered[state.cursor]; if (pick) execute(pick); return; }
          },
        },
      }),
      el('kbd', { class: 'wbCmdBarHint' }, 'Esc'),
    ]);
    state.input = head.querySelector('.wbCmdBarInput');

    const list = el('div', { class: 'wbCmdBarList', role: 'listbox', 'aria-label': 'Commands' });
    state.list = list;

    const foot = el('footer', { class: 'wbCmdBarFoot' }, [
      el('div', { class: 'wbCmdBarStatus', data: { kind: 'idle' } }, ''),
      el('div', { class: 'wbCmdBarKeys' }, [
        el('kbd', {}, '↑↓'),
        el('span', {}, 'navigate'),
        el('kbd', {}, '↵'),
        el('span', {}, 'run'),
        el('kbd', {}, 'Esc'),
        el('span', {}, 'close'),
      ]),
    ]);
    state.statusEl = foot.querySelector('.wbCmdBarStatus');

    panel.append(head, list, foot);
    overlay.append(backdrop, panel);
    D.body.appendChild(overlay);
    state.overlay = overlay;
    step('overlay.built');
  }

  // ── Global key binding ─────────────────────────────────────────────────────
  function isCmdK(ev) {
    if (!ev) return false;
    // Cmd+K on macOS, Ctrl+K elsewhere. Avoid clashing with browser find (Ctrl+F).
    const accel = ev.metaKey || ev.ctrlKey;
    return accel && (ev.key === 'k' || ev.key === 'K');
  }
  W.addEventListener('keydown', (ev) => {
    if (isCmdK(ev)) { ev.preventDefault(); toggle(); }
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  const CommandBar = {
    surface: 'studio',
    open, close, toggle,
    refresh() { state.items = discoverItems(); render(); },
    isOpen() { return state.open; },
    diagnose() {
      return {
        surface: 'studio',
        open: state.open,
        commands: discoverItems().length,
        groups: getCmdBar()?.listGroups?.() || [],
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.CommandBar = CommandBar;
  H2O.Library = H2O.Library || {};
  H2O.Library.CommandBar = CommandBar;

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('command-bar', CommandBar, { replace: true });
      step('register-on-core', 'command-bar');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });

  step('boot', 'studio-command-bar-ready');
})();
