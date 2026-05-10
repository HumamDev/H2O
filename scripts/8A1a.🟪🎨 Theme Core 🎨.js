// ==UserScript==
// @h2o-id             8a1a.theme.core
// @name               8A1a.🟪🎨 Theme Core 🎨
// @namespace          H2O.Premium.CGX.theme.core
// @author             HumamDev
// @version            0.2.0
// @revision           002
// @build              260509-200000
// @description        Canonical theme owner — Phase 2A (active mode owner). Themes Panel → Theme Core → website mode. Active for mode only (setMode / set({mode})); palette/accent/density/etc. stay passive (warn + return false). Preserves OLED as a real canonical mode; writes data-h2o-mode and data-h2o-effective-mode on <html>; injects one minimal <style id="h2o-theme-surface"> with body-level page-background tokens for light/dark/oled. No layout properties. No !important. Skins Registry / Control Hub / Themes Panel body untouched.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ IDENTITY PREFLIGHT ───────────────────────────── */
  const W = window;

  const TOK = 'TC';
  const PID = 'theme';
  const CID = 'thmcore';
  const DsID = 'theme';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const NS_MEM  = `${TOK}:${PID}:guard`;
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  /* ───────────────────────────── ⬛️ STORAGE KEYS ───────────────────────────── */
  // Canonical (owned by this script)
  const KEY_THEME_STATE_V1 = `${NS_DISK}:state:v1`;

  // Legacy (read-only fallback when canonical is absent)
  // Themes Panel is the SOLE source of accent for Theme Core. Control Hub
  // accent (h2o:prm:cgx:cntrlhb:state:accent:control:v1) is a separate system
  // and must not be imported into Theme Core canonical accent.
  const KEY_LEGACY_TPANEL_V2     = 'h2o:prm:cgx:thmspnl:ui:settings:v2';
  const KEY_LEGACY_TPANEL_OLD    = 'ho:gpthemeSettings';
  const KEY_LEGACY_SKIN_PRIME    = 'h2o:prime:chatgpt:h2oskins:skins:active:v1';
  const KEY_LEGACY_SKIN_PRM      = 'h2o:prm:cgx:h2oskins:skins:active:v1';

  /* ───────────────────────────── 🔔 EVENT NAMES ───────────────────────────── */
  // Outbound (we emit these)
  const EV_THEME_READY_CANON   = 'evt:h2o:theme:ready';
  const EV_THEME_READY_LEGACY  = 'h2o:theme:ready';
  const EV_THEME_CHANGED_CANON = 'evt:h2o:theme:changed';
  const EV_THEME_CHANGED_LEG   = 'h2o:theme:changed';

  // Inbound (we listen to these — dual listener per CLAUDE.md).
  // Phase 2A: Theme Core observes ONLY the Themes Panel.
  //   Themes Panel → Theme Core → website mode (data-h2o-mode + data-h2o-effective-mode).
  // Skins Registry / Control Hub are out of scope and not observed.
  const EV_TPANEL_SETTINGS_CANON = 'evt:h2o:themes:settings_changed';
  const EV_TPANEL_SETTINGS_LEG   = 'h2o:themes:settings_changed'; // dual-listen mirror

  /* ───────────────────────────── 🏷️ STATIC METADATA ─────────────────────────────
   * Phase 1 ships static metadata only — no color values, no CSS, no token math.
   * Palettes/accents listed here mirror Phase 4's planned set so the Phase 1 state
   * synthesis can map legacy skin/accent names onto stable IDs without committing
   * to any visual treatment.
   * ──────────────────────────────────────────────────────────────────────────── */
  const PALETTES = Object.freeze([
    Object.freeze({ id: 'soft-charcoal',    label: 'Soft Charcoal' }),
    Object.freeze({ id: 'warm-graphite',    label: 'Warm Graphite' }),
    Object.freeze({ id: 'soft-sand-light',  label: 'Soft Sand Light' }),
    Object.freeze({ id: 'deep-navy-slate',  label: 'Deep Navy Slate' }),
    Object.freeze({ id: 'muted-olive',      label: 'Muted Olive Graphite' }),
    Object.freeze({ id: 'calm-violet',      label: 'Calm Violet Graphite' }),
  ]);

  const ACCENTS = Object.freeze([
    Object.freeze({ id: 'gold',       label: 'Gold' }),
    Object.freeze({ id: 'sand',       label: 'Sand' }),
    Object.freeze({ id: 'amber',      label: 'Amber' }),
    Object.freeze({ id: 'rose',       label: 'Rose' }),
    Object.freeze({ id: 'terracotta', label: 'Terracotta' }),
    Object.freeze({ id: 'sage',       label: 'Sage' }),
    Object.freeze({ id: 'ocean',      label: 'Ocean' }),
    Object.freeze({ id: 'lavender',   label: 'Lavender' }),
    Object.freeze({ id: 'graphite',   label: 'Graphite' }),
    Object.freeze({ id: 'neutral',    label: 'Neutral' }),
  ]);

  const PALETTE_IDS = new Set(PALETTES.map(p => p.id));
  const ACCENT_IDS  = new Set(ACCENTS.map(a => a.id));

  // Defaults are deliberately conservative; only used if everything else fails.
  const DEFAULT_STATE = Object.freeze({
    mode:    'dark',
    palette: 'soft-charcoal',
    accent:  'gold',
  });

  /* ───────────────────────────── 🗺️ LEGACY → CANONICAL MAPS ───────────────────────────── */
  // 8A2a Skins Registry preset names + aliases → palette ID
  const SKIN_TO_PALETTE = Object.freeze({
    'Sand Glass':       'soft-sand-light',
    'Aurora Glass':     'deep-navy-slate',
    'Ice Glass':        'deep-navy-slate',
    'Dark Matte':       'soft-charcoal',
    'Smoke Glass':      'soft-charcoal',
    'Cockpit Ember':    'warm-graphite',
    'Onboarding':       'warm-graphite',
    'Cockpit Pro':      'warm-graphite',
    'Entry Surface':    'warm-graphite',
    'Warm Charcoal':    'warm-graphite',
    'Graphite Amber':   'warm-graphite',
    'Graphite Signal':  'muted-olive',
    'Stealth Signal':   'soft-charcoal',
    'MiniMap HUD':      'soft-charcoal',
  });

  // Each Skins Registry preset implies a default mode (dark vs light)
  const SKIN_TO_MODE = Object.freeze({
    'Sand Glass':       'light',
    'Aurora Glass':     'dark',
    'Ice Glass':        'dark',
    'Dark Matte':       'dark',
    'Smoke Glass':      'dark',
    'Cockpit Ember':    'dark',
    'Onboarding':       'dark',
    'Cockpit Pro':      'dark',
    'Entry Surface':    'dark',
    'Warm Charcoal':    'dark',
    'Graphite Amber':   'dark',
    'Graphite Signal':  'dark',
    'Stealth Signal':   'dark',
    'MiniMap HUD':      'dark',
  });

  /* ─────────────────────── 🟪 THEMES PANEL ACCENT PRESET → CANONICAL ID ───────────────────────
   * The Themes Panel (8A1b) stores accent as two HSL strings: accentLight and
   * accentDark. Its 7 named presets each have a fixed (light, dark) HSL pair —
   * source: 8A1b.🟪🎨 Themes Panel 🎨.js:233-241 ACCENT_PRESETS array.
   *
   * Phase 1 maps a Themes Panel accent to a canonical accent ID by EXACT
   * string match against either the light or the dark HSL of a preset (both
   * change together on preset selection, so either match is sufficient).
   *
   * Custom-hue accents (when the user drags the Themes Panel hue picker —
   * see 8A1b lines 1122-1123) won't match any preset; we leave the canonical
   * accent unchanged in that case rather than guess.
   * ────────────────────────────────────────────────────────────────────────── */
  const TPANEL_ACCENT_PRESETS = Object.freeze([
    Object.freeze({ key: 'lavender', light: '260, 55%, 78%', dark: '260, 45%, 62%', id: 'lavender' }),
    Object.freeze({ key: 'coral',    light: '12, 70%, 72%',  dark: '12, 60%, 55%',  id: 'terracotta' }),
    Object.freeze({ key: 'aqua',     light: '188, 55%, 70%', dark: '188, 50%, 50%', id: 'ocean' }),
    Object.freeze({ key: 'emerald',  light: '152, 45%, 68%', dark: '152, 40%, 48%', id: 'sage' }),
    Object.freeze({ key: 'amber',    light: '40, 70%, 72%',  dark: '36, 65%, 52%',  id: 'amber' }),
    Object.freeze({ key: 'rose',     light: '338, 60%, 72%', dark: '338, 52%, 54%', id: 'rose' }),
    Object.freeze({ key: 'slate',    light: '220, 18%, 70%', dark: '220, 18%, 46%', id: 'graphite' }),
  ]);

  function tpanelAccentToId(accentLight, accentDark) {
    const aL = (accentLight || '').trim();
    const aD = (accentDark  || '').trim();
    if (!aL && !aD) return null;
    for (let i = 0; i < TPANEL_ACCENT_PRESETS.length; i++) {
      const p = TPANEL_ACCENT_PRESETS[i];
      if ((aL && aL === p.light) || (aD && aD === p.dark)) return p.id;
    }
    return null; // custom hue — do not guess
  }

  // 8A1a (now 8A1b) Themes Panel mode enum → canonical mode
  // Phase 2A: OLED is preserved as a real canonical mode. 'oled' is NOT
  // collapsed to 'dark' in canonical state — it round-trips through Theme Core
  // and is written to <html data-h2o-mode="oled">. The derived effectiveMode()
  // helper resolves OLED to 'dark' for binary light/dark token branching.
  function normalizeMode(rawMode) {
    if (rawMode === 'system') return 'system';
    if (rawMode === 'light') return 'light';
    if (rawMode === 'dark')  return 'dark';
    if (rawMode === 'oled')  return 'oled';
    return null;
  }

  function resolveEffectiveMode(canonicalMode) {
    if (canonicalMode === 'system') {
      return W.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
    }
    return (canonicalMode === 'oled') ? 'dark' : canonicalMode;
  }

  /* ───────────────────────────── 🛠️ STORAGE UTILS ───────────────────────────── */
  function safeGet(key) {
    try { return W.localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { W.localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }
  function safeJSON(raw) {
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  /* ───────────────────────────── 🎯 STATE NORMALIZATION ───────────────────────────── */
  // Valid mode values in Phase 2A: 'system' | 'light' | 'dark' | 'oled'. Anything else
  // falls back to DEFAULT_STATE.mode. ('auto' is reserved for Phase 4+ and is
  // not yet a valid mode here.)
  function isValidMode(m) { return m === 'system' || m === 'light' || m === 'dark' || m === 'oled'; }

  function normalizeState(candidate) {
    const mode    = (candidate && isValidMode(candidate.mode))
      ? candidate.mode : DEFAULT_STATE.mode;
    const palette = (candidate && PALETTE_IDS.has(candidate.palette))
      ? candidate.palette : DEFAULT_STATE.palette;
    const accent  = (candidate && ACCENT_IDS.has(candidate.accent))
      ? candidate.accent : DEFAULT_STATE.accent;
    return Object.freeze({ mode, palette, accent });
  }

  function statesEqual(a, b) {
    if (!a || !b) return false;
    return a.mode === b.mode && a.palette === b.palette && a.accent === b.accent;
  }

  function diffStates(a, b) {
    const out = {};
    if (!a || !b) return out;
    if (a.mode    !== b.mode)    out.mode    = { from: a.mode,    to: b.mode };
    if (a.palette !== b.palette) out.palette = { from: a.palette, to: b.palette };
    if (a.accent  !== b.accent)  out.accent  = { from: a.accent,  to: b.accent };
    return out;
  }

  /* ───────────────────────────── 🧩 LEGACY SYNTHESIS ───────────────────────────── */
  // Synthesize a canonical state by reading the legacy keys in priority order.
  // Each source contributes the fields it knows about; later sources do NOT
  // override earlier sources' fields.
  function synthesizeFromLegacy() {
    let mode = null, palette = null, accent = null;

    // 1) Themes Panel v2 settings (PRIMARY source — mode + accent if preset)
    const tpRaw = safeGet(KEY_LEGACY_TPANEL_V2) || safeGet(KEY_LEGACY_TPANEL_OLD);
    const tp = safeJSON(tpRaw);
    if (tp && typeof tp === 'object') {
      const m = normalizeMode(tp.mode);
      if (m) mode = m;
      const a = tpanelAccentToId(tp.accentLight, tp.accentDark);
      if (a) accent = a;
    }

    // 2) Skins Registry active skin — OPTIONAL fallback for palette+mode only.
    //    (Phase 1 scope is Themes Panel; Skins Registry is read here strictly
    //     as a one-shot synthesis fallback if Themes Panel didn't supply mode.)
    const skinRaw = safeGet(KEY_LEGACY_SKIN_PRIME) || safeGet(KEY_LEGACY_SKIN_PRM);
    if (skinRaw) {
      const skinName = String(skinRaw).replace(/^"|"$/g, ''); // unquote raw stored string
      if (Object.prototype.hasOwnProperty.call(SKIN_TO_PALETTE, skinName)) {
        if (!palette) palette = SKIN_TO_PALETTE[skinName];
        if (!mode    && SKIN_TO_MODE[skinName]) mode = SKIN_TO_MODE[skinName];
      }
    }

    // Control Hub accent (h2o:prm:cgx:cntrlhb:state:accent:control:v1) is a
    // separate system and is intentionally NOT imported here. If the Themes
    // Panel HSL pair is a custom hue (no preset match), accent stays null and
    // falls through to DEFAULT_STATE.accent below — Phase 1 does not guess
    // and does not import accent from any non–Themes-Panel source.

    return normalizeState({
      mode:    mode    || DEFAULT_STATE.mode,
      palette: palette || DEFAULT_STATE.palette,
      accent:  accent  || DEFAULT_STATE.accent,
    });
  }

  /* ───────────────────────────── 💾 LOAD / PERSIST ───────────────────────────── */
  function loadState() {
    const canonRaw = safeGet(KEY_THEME_STATE_V1);
    const canon    = safeJSON(canonRaw);
    if (canon && typeof canon === 'object') {
      return normalizeState(canon);
    }
    // No canonical state yet — synthesize from legacy keys and persist.
    const synth = synthesizeFromLegacy();
    persistState(synth);
    return synth;
  }

  function persistState(state) {
    safeSet(KEY_THEME_STATE_V1, JSON.stringify({
      mode: state.mode, palette: state.palette, accent: state.accent,
    }));
  }

  /* ───────────────────────────── 📡 EVENT EMIT ───────────────────────────── */
  function emitReady(state) {
    const ts = Date.now();
    const detail = { state, ts };
    try { W.H2O?.events?.emitReady?.(EV_THEME_READY_CANON, detail); } catch (_) {}
    try { W.dispatchEvent(new CustomEvent(EV_THEME_READY_LEGACY, { detail })); } catch (_) {}
  }

  function emitChanged(from, to, reason) {
    const ts = Date.now();
    const detail = { from, to, diff: diffStates(from, to), reason: reason || 'unknown', ts };
    // Notify in-process subscribers exactly once per logical change. Doing this
    // here (rather than via a DOM-listener bridge) avoids the double-fire that
    // would otherwise happen when both EV_THEME_CHANGED_CANON and
    // EV_THEME_CHANGED_LEG dispatch.
    notifyChangeSubscribers(detail);
    // External listeners still get both canonical + legacy DOM dispatches.
    try { W.H2O?.events?.emit?.(EV_THEME_CHANGED_CANON, detail); } catch (_) {}
    try { W.dispatchEvent(new CustomEvent(EV_THEME_CHANGED_LEG, { detail })); } catch (_) {}
  }

  /* ───────────────────────────── 🪝 SUBSCRIPTIONS ───────────────────────────── */
  // Dual listener registration per CLAUDE.md convention: subscribe to both the
  // canonical evt:h2o:* form AND the legacy h2o:* form, since older emitters
  // may dispatch only the legacy mirror.
  function dualListen(canonName, fn) {
    try { W.addEventListener(canonName, fn, false); } catch (_) {}
    if (canonName.startsWith('evt:')) {
      try { W.addEventListener(canonName.slice(4), fn, false); } catch (_) {}
    }
  }

  /* ───────────────────────────── 🎨 GLOBAL APPLICATION (Phase 2A — mode only) ─────────────────────────────
   * applyMode / applyThemeState write the canonical mode attributes on <html>
   * and ensure the page-background style block is mounted. These are the entry
   * points for "Theme Core owns the website theme" — Phase 2A applies MODE only.
   * Future phases (2B palette, 2C accent) extend applyThemeState without
   * changing the existing flow.
   *
   * Two attributes are written:
   *   data-h2o-mode           = canonical user intent ('system' | 'light' | 'dark' | 'oled')
   *   data-h2o-effective-mode = resolved binary ('light' | 'dark'); OLED → 'dark'
   *
   * Phase 2A intentionally ships only the safest body-level rules. Selectors
   * for app shell / chat reading surface / header / sidebar / input footer
   * require live ChatGPT/Cockpit Pro DOM inspection that this implementation
   * pass cannot perform; deeper surface coverage is deferred until a follow-up
   * pass with DevTools access. See validation report after this phase.
   * ──────────────────────────────────────────────────────────────────────────── */

  const STYLE_SURFACE_ID = 'h2o-theme-surface';

  // Token + body-rule CSS. NO layout properties. NO !important. Specificity
  // wins over Themes Panel's `body[data-ho-theme-enabled="true"]` (1 attribute)
  // by prefixing rules with `html[data-h2o-effective-mode=...]` (1 attribute
  // on html + 1 on body), so this rule cascades win without `!important`.
  const SURFACE_CSS = `
/* ── Phase 2A tokens (minimum viable) ──
   Light = soft warm Sand-Glass paper — NOT harsh white.
   Dark  = calm Soft Charcoal — slight warm cast, low glare.
   OLED  = true black canvas, slightly muted text for readability. */
:root[data-h2o-effective-mode="light"] {
  --h2o-bg-canvas:    #fbf7ee;
  --h2o-bg-surface:   #f4ecdb;
  --h2o-bg-elevated:  #efe6d2;
  --h2o-text-primary: #3a3429;
  --h2o-text-muted:   #6e6557;
  --h2o-border-soft:  rgba(58, 52, 41, 0.10);
}
:root[data-h2o-effective-mode="dark"] {
  --h2o-bg-canvas:    #1a1a1c;
  --h2o-bg-surface:   #232327;
  --h2o-bg-elevated:  #2a2a2f;
  --h2o-text-primary: rgba(231, 226, 217, 0.92);
  --h2o-text-muted:   rgba(231, 226, 217, 0.62);
  --h2o-border-soft:  rgba(231, 226, 217, 0.10);
}
:root[data-h2o-mode="oled"] {
  --h2o-bg-canvas:    #000000;
  --h2o-bg-surface:   #0e0e10;
  --h2o-bg-elevated:  #141418;
  --h2o-text-primary: rgba(231, 226, 217, 0.84);
  --h2o-text-muted:   rgba(231, 226, 217, 0.54);
  --h2o-border-soft:  rgba(231, 226, 217, 0.08);
}

/* ── Page-level background only (safest layer) ──
   Phase 2A ships ONLY the body-level paint. Deeper selectors for the app shell,
   chat reading surface, header, sidebar, input footer require live DOM
   inspection (DevTools) before they can be safely chosen — generic blanket
   selectors like main, section, article, aside are explicitly forbidden.
   See report. */
html[data-h2o-effective-mode="light"] body,
html[data-h2o-effective-mode="dark"]  body {
  background: var(--h2o-bg-canvas);
  color: var(--h2o-text-primary);
}
html[data-h2o-mode="oled"] body {
  background: var(--h2o-bg-canvas);
  color: var(--h2o-text-primary);
}
`;

  function ensureSurfaceStyle() {
    try {
      const D = W.document;
      if (!D || !D.head) return;
      let el = D.getElementById(STYLE_SURFACE_ID);
      if (!el) {
        el = D.createElement('style');
        el.id = STYLE_SURFACE_ID;
        el.setAttribute('data-h2o-owner', CID);
        el.textContent = SURFACE_CSS;
        D.head.appendChild(el);
      } else if (el.textContent !== SURFACE_CSS) {
        el.textContent = SURFACE_CSS;
      }
    } catch (_) {}
  }

  function applyMode(mode) {
    try {
      const D = W.document;
      if (!D || !D.documentElement) return;
      const html = D.documentElement;
      const eff  = resolveEffectiveMode(mode);
      if (html.getAttribute('data-h2o-mode') !== mode) {
        html.setAttribute('data-h2o-mode', mode);
      }
      if (html.getAttribute('data-h2o-effective-mode') !== eff) {
        html.setAttribute('data-h2o-effective-mode', eff);
      }
    } catch (_) {}
  }

  function applyThemeState(state) {
    // Phase 2A applies MODE only. Future phases extend this:
    //   2B will applyPalette; 2C will applyAccent. Order matters: ensure the
    //   style block exists BEFORE writing the attribute, so the first paint
    //   already has both inputs available.
    ensureSurfaceStyle();
    applyMode(state.mode);
  }

  /* ───────────────────────────── 🚦 RUNTIME ───────────────────────────── */
  // Idempotent boot guard
  if (W[`__H2O_GUARD__${CID}`]) return;
  W[`__H2O_GUARD__${CID}`] = 1;

  let currentState = loadState();
  let isReady      = true; // synchronous initial load is final

  // Track recent emits to deduplicate echo loops (e.g. Themes Panel emitting,
  // we update, persist triggers storage event, which we then process again).
  let lastEmitFingerprint = `${currentState.mode}|${currentState.palette}|${currentState.accent}`;

  function applyNewState(nextState, reason) {
    const next = normalizeState(nextState);
    if (statesEqual(currentState, next)) return false;
    const fp = `${next.mode}|${next.palette}|${next.accent}`;
    if (fp === lastEmitFingerprint) return false;
    const prev = currentState;
    currentState = next;
    lastEmitFingerprint = fp;
    persistState(next);
    // Phase 2A: write global attributes (and ensure style block) BEFORE emitting
    // 'changed', so subscribers observe the DOM in the new state.
    applyThemeState(next);
    emitChanged(prev, next, reason);
    return true;
  }

  function onLegacyThemesSettingsChanged(e) {
    // Themes Panel emits the full settings object on every save (canonical name
    // 'evt:h2o:themes:settings_changed', detail = {...STATE.settings}).
    // We extract mode and (when the user picked a named preset) accent.
    const d = (e && e.detail) || {};
    const next = { ...currentState };
    let touched = false;

    const m = normalizeMode(d.mode);
    if (m && m !== currentState.mode) { next.mode = m; touched = true; }

    const a = tpanelAccentToId(d.accentLight, d.accentDark);
    if (a && a !== currentState.accent) { next.accent = a; touched = true; }
    // If a is null (custom-hue accent), leave canonical accent unchanged —
    // Phase 1 does not guess at non-preset HSL values.

    if (touched) applyNewState(next, 'legacy:themes-panel');
  }

  function onCanonicalStorage(e) {
    if (!e || e.key !== KEY_THEME_STATE_V1) return;
    const parsed = safeJSON(e.newValue);
    if (!parsed) return;
    applyNewState(parsed, 'storage');
  }

  // Phase 1 observes the Themes Panel only. Skins Registry and Control Hub
  // accent enum are read once at synthesis time (above); they do NOT drive
  // live state changes in Phase 1.
  dualListen(EV_TPANEL_SETTINGS_CANON, onLegacyThemesSettingsChanged);
  try { W.addEventListener('storage', onCanonicalStorage, false); } catch (_) {}

  /* ───────────────────────────── 🌐 PUBLIC API — H2O.theme ───────────────────────────── */
  W.H2O = W.H2O || {};

  if (W.H2O.theme && typeof W.H2O.theme.get === 'function') {
    // Already installed (hot reload, duplicate inject) — leave existing in place.
    return;
  }

  // Replay buffer for onChange/onReady subscribers that arrive after first emit
  // but before the current invocation. Bounded — last value only.
  const readySubscribers  = new Set();
  const changeSubscribers = new Set();

  function notifyChangeSubscribers(detail) {
    changeSubscribers.forEach(fn => {
      try { fn(detail); } catch (err) {
        try { console.warn('[h2o-theme] onChange handler err', err); } catch (_) {}
      }
    });
  }

  function onReady(fn) {
    if (typeof fn !== 'function') return () => {};
    if (isReady) {
      // Microtask defer so the caller's setup completes first.
      Promise.resolve().then(() => {
        try { fn({ state: currentState, ts: Date.now() }); } catch (err) {
          try { console.warn('[h2o-theme] onReady handler err', err); } catch (_) {}
        }
      });
    }
    readySubscribers.add(fn);
    return function offReady() { readySubscribers.delete(fn); };
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    changeSubscribers.add(fn);
    return function offChange() { changeSubscribers.delete(fn); };
  }

  // In-process changeSubscribers are notified exactly once per logical change
  // by emitChanged() itself (see notifyChangeSubscribers above). We deliberately
  // do NOT bridge the canonical/legacy DOM events back into changeSubscribers —
  // that would double-fire onChange(), since emitChanged() dispatches both names.

  /* ─────────────────────── ✍️ WRITERS — per-phase activation ───────────────────────
   *   Phase 2A : setMode + set({mode}) ACTIVE; rest passive.
   *   Phase 2B : setPalette + set({palette}) become active.
   *   Phase 2C : setAccent + set({accent}) become active; reset becomes active.
   *
   * All writers return boolean. Active writers route through applyNewState
   * (which persists, applies global attributes, and emits 'changed').
   * ──────────────────────────────────────────────────────────────────────────── */

  function passiveWriter(name) {
    try {
      console.warn(`[h2o-theme] H2O.theme.${name} is passive in Phase 2A — returns false. Active in a future phase.`);
    } catch (_) {}
    return false;
  }

  // ACTIVE — mode only.
  function setModeActive(mode) {
    if (!isValidMode(mode)) {
      try {
        console.warn(`[h2o-theme] H2O.theme.setMode rejected invalid mode '${mode}'. Expected 'system' | 'light' | 'dark' | 'oled'.`);
      } catch (_) {}
      return false;
    }
    if (mode === currentState.mode) return true;       // already at target — no-op success
    return applyNewState({ ...currentState, mode }, 'api:setMode');
  }

  // ACTIVE for {mode}, passive otherwise. If `partial` contains any key other
  // than 'mode' (palette / accent / density / reduceMotion / highContrast),
  // the call is REJECTED as a whole — no silent partial application.
  function setActive(partial /*, reason */) {
    if (!partial || typeof partial !== 'object') {
      try { console.warn('[h2o-theme] H2O.theme.set requires a partial state object.'); } catch (_) {}
      return false;
    }
    const keys = Object.keys(partial);
    const passiveKeys = keys.filter(k => k !== 'mode');
    if (passiveKeys.length > 0) {
      try {
        console.warn(`[h2o-theme] H2O.theme.set rejected — keys [${passiveKeys.join(', ')}] are passive in Phase 2A. Only 'mode' is active.`);
      } catch (_) {}
      return false;
    }
    if (!('mode' in partial)) {
      // Empty / no-op set call — treat as success but no state change.
      return true;
    }
    return setModeActive(partial.mode);
  }

  W.H2O.theme = Object.freeze({
    // Reads
    get()             { return currentState; },
    getToken(_name)   { return null; }, // No general token system yet (Phase 2B+)
    listPalettes()    { return PALETTES; },
    listAccents()     { return ACCENTS; },
    isReady()         { return isReady; },
    effectiveMode()   { return resolveEffectiveMode(currentState.mode); },

    // Subscription
    onReady,
    onChange,

    // Writes — Phase 2A: only mode is active.
    set:             setActive,
    setMode:         setModeActive,
    setPalette:      () => passiveWriter('setPalette'),
    setAccent:       () => passiveWriter('setAccent'),
    setDensity:      () => passiveWriter('setDensity'),
    setReduceMotion: () => passiveWriter('setReduceMotion'),
    setHighContrast: () => passiveWriter('setHighContrast'),
    reset:           () => passiveWriter('reset'),

    // Phase tag for diagnostics
    __phase: '2A',
  });

  /* ───────────────────────────── 🚀 BOOT ───────────────────────────── */
  // Apply current state to the DOM BEFORE emitting 'ready', so the very first
  // subscriber sees the page already in the correct mode.
  applyThemeState(currentState);

  emitReady(currentState);
  // Fire local readySubscribers that may have registered between freeze and now
  // (race window is sub-microtask but we cover it).
  Promise.resolve().then(() => {
    readySubscribers.forEach(fn => {
      try { fn({ state: currentState, ts: Date.now() }); } catch (_) {}
    });
  });

  try { console.info('[h2o-theme] active mode owner — Phase 2A'); } catch (_) {}

})();
