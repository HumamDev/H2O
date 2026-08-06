// ==H2O Module==
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
// ==/H2O Module==

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

  // Canonical modes that no controller UI can represent. Downstream surfaces only
  // ever observe their effective light/dark projection, so a surface reporting
  // that projection back is echoing our own state, never expressing intent.
  // See adoptCompatibilityMode().
  const CANONICAL_ONLY_MODES = Object.freeze(['oled']);

  function isCanonicalOnlyMode(m) { return CANONICAL_ONLY_MODES.indexOf(m) !== -1; }

  // Modes ChatGPT's own Appearance picker can express. Used to project a
  // canonical mode onto something the native dialog can actually select.
  const NATIVE_SUPPORTED_MODES = Object.freeze(['system', 'light', 'dark']);

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
  const STYLE_PREPAINT_ID = 'h2o-theme-prepaint';

  /* ─────────────── 🏷️ GLOBAL MODE ATTRIBUTES — Theme Core owns all three ───────────────
   *   data-h2o-mode            canonical intent   'system' | 'light' | 'dark' | 'oled'
   *   data-h2o-effective-mode  derived binary     'light' | 'dark'
   *   data-ho-mode             Panel compat       'light' | 'dark'
   *
   * data-ho-mode is read by the Themes Panel stylesheet
   * (8A1b `html[data-ho-mode="light"]` / `="dark"`). It carries the EFFECTIVE
   * value, never the canonical one: the Panel has no `="oled"` branch, so 'oled'
   * there would fall through to the :root defaults and paint dark navy instead of
   * OLED black. 'system' is resolved here rather than left to the Panel's @media
   * rules, so all three attributes always describe one resolved state.
   *
   * Previously the Panel (8A1b) and the Control Hub Appearance mirror (0Z1k) both
   * wrote data-ho-mode directly. Theme Core is now its sole runtime writer.
   * ──────────────────────────────────────────────────────────────────────────── */
  const ATTR_MODE_CANONICAL    = 'data-h2o-mode';
  const ATTR_MODE_EFFECTIVE    = 'data-h2o-effective-mode';
  const ATTR_MODE_PANEL_COMPAT = 'data-ho-mode';

  /* ─────────────── 🔌 WEBSITE-THEME ENABLED STATE ───────────────
   * The Panel's `html[data-ho-mode]{background:… !important}` rule is what paints
   * the page canvas, so the ABSENCE of data-ho-mode is how "website theme off" is
   * expressed. Theme Core therefore needs to know that state.
   *
   * It is read STRAIGHT FROM THE CANONICAL STORE rather than declared by a
   * controller, deliberately:
   *   - no controller can win a race by calling last;
   *   - the theme keeps working when the Panel is closed, unmounted or absent;
   *   - Control Hub Appearance-tab VISIBILITY cannot reach it. Tab visibility is
   *     not theme activation. 0Z1k used to overlay `{enabled:false}` derived from
   *     CHUB_VIS_isAppearanceVisible() at apply time; it never persisted that, so
   *     reading storage is immune to it by construction.
   * Default true — matches the Panel's own DEFAULT_SETTINGS.enabled.
   * ──────────────────────────────────────────────────────────────────────────── */
  function readPageThemeEnabled() {
    const raw = safeJSON(safeGet(KEY_LEGACY_TPANEL_V2)) || safeJSON(safeGet(KEY_LEGACY_TPANEL_OLD));
    if (!raw || typeof raw !== 'object') return true;
    return raw.enabled !== false;
  }

  let pageThemeEnabled = readPageThemeEnabled();

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
      if (!D || !D.head) return null;
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
      return el;
    } catch (_) {
      return null;
    }
  }

  function applyMode(mode) {
    try {
      const D = W.document;
      if (!D || !D.documentElement) return false;
      const html = D.documentElement;
      const eff  = resolveEffectiveMode(mode);
      if (html.getAttribute(ATTR_MODE_CANONICAL) !== mode) {
        html.setAttribute(ATTR_MODE_CANONICAL, mode);
      }
      if (html.getAttribute(ATTR_MODE_EFFECTIVE) !== eff) {
        html.setAttribute(ATTR_MODE_EFFECTIVE, eff);
      }
      // Panel compatibility attribute — effective value only, present only while
      // the website theme is enabled. Read-before-write on both branches, so a
      // re-apply with unchanged state mutates nothing.
      if (pageThemeEnabled) {
        if (html.getAttribute(ATTR_MODE_PANEL_COMPAT) !== eff) {
          html.setAttribute(ATTR_MODE_PANEL_COMPAT, eff);
        }
      } else if (html.hasAttribute(ATTR_MODE_PANEL_COMPAT)) {
        html.removeAttribute(ATTR_MODE_PANEL_COMPAT);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Re-read the canonical enabled flag and re-apply if it changed. Called from
  // the Panel settings broadcast and from cross-tab storage events — never from a
  // controller's visibility state.
  function refreshPageThemeEnabled() {
    const next = readPageThemeEnabled();
    if (next === pageThemeEnabled) return false;
    pageThemeEnabled = next;
    applyMode(currentState.mode);
    return true;
  }

  function applyThemeState(state) {
    // Phase 2A applies MODE only. Future phases extend this:
    //   2B will applyPalette; 2C will applyAccent. Order matters: ensure the
    //   style block exists BEFORE writing the attribute, so the first paint
    //   already has both inputs available.
    const surfaceStyle = ensureSurfaceStyle();
    if (!surfaceStyle || !applyMode(state.mode)) return false;
    try {
      const D = W.document;
      if (D?.getElementById?.(STYLE_SURFACE_ID) !== surfaceStyle) return false;
      D.getElementById(STYLE_PREPAINT_ID)?.remove?.();
    } catch (_) {
      return false;
    }
    return true;
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
    // We extract the accent (when the user picked a named preset) and refresh the
    // website-theme enabled flag.
    //
    // Mode is deliberately NOT read from this broadcast. The Panel's settings blob
    // can only hold 'system' | 'light' | 'dark', and the broadcast cannot say
    // whether that value is a user's intent or merely the Panel's projection of
    // canonical state. Adopting it rewrote canonical 'oled' on every save — even
    // saves that changed nothing but a font slider, and the save the ChatGPT
    // Settings dialog triggers through the Panel's native sync. Mode now travels
    // one way only: intent → requestMode / adoptCompatibilityMode → here.
    refreshPageThemeEnabled();

    const d = (e && e.detail) || {};
    const next = { ...currentState };
    let touched = false;

    const a = tpanelAccentToId(d.accentLight, d.accentDark);
    if (a && a !== currentState.accent) { next.accent = a; touched = true; }
    // If a is null (custom-hue accent), leave canonical accent unchanged —
    // Phase 1 does not guess at non-preset HSL values.

    if (touched) applyNewState(next, 'legacy:themes-panel');
  }

  function onCanonicalStorage(e) {
    if (!e) return;
    // Cross-tab: the website-theme enabled flag lives in the Panel's blob, so a
    // toggle in another tab arrives as a change to that key, not to ours.
    if (e.key === KEY_LEGACY_TPANEL_V2 || e.key === KEY_LEGACY_TPANEL_OLD) {
      refreshPageThemeEnabled();
      return;
    }
    if (e.key !== KEY_THEME_STATE_V1) return;
    const parsed = safeJSON(e.newValue);
    if (!parsed) return;
    applyNewState(parsed, 'storage');
  }

  // Phase 1 observes the Themes Panel only. Skins Registry and Control Hub
  // accent enum are read once at synthesis time (above); they do NOT drive
  // live state changes in Phase 1.
  dualListen(EV_TPANEL_SETTINGS_CANON, onLegacyThemesSettingsChanged);
  try { W.addEventListener('storage', onCanonicalStorage, false); } catch (_) {}

  /* Canonical 'system' resolves against the OS preference at apply time, so a live
   * OS light/dark switch must re-resolve all three attributes. This listener is
   * required BY this phase: the Panel used to track the OS itself through @media
   * rules on html[data-ho-mode="system"], and now that Theme Core resolves the
   * compatibility value up front that CSS path never matches. Without this,
   * 'system' would freeze at whatever the OS was when the page loaded.
   *
   * Attributes only — no persist (canonical intent is unchanged), no broadcast
   * (no state change to announce), and applyMode is read-before-write so a
   * spurious event mutates nothing. Registered once: the module's boot guard
   * (__H2O_GUARD__) returns before this line on a duplicate injection.
   */
  function onSystemSchemeChange() {
    if (currentState.mode === 'system') applyMode(currentState.mode);
  }
  try {
    const mq = W.matchMedia?.('(prefers-color-scheme: light)');
    if (mq?.addEventListener) mq.addEventListener('change', onSystemSchemeChange);
    else if (mq?.addListener) mq.addListener(onSystemSchemeChange); // legacy Safari
  } catch (_) {}

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

  /* ══════════════ INTENT vs ECHO ══════════════
   * Two deliberately separate operations. Which one a caller uses encodes what
   * the caller KNOWS about the event, and that cannot be inferred from the mode
   * value or from timing — so it must not be one function with a flag.
   *
   *   requestMode(mode)                  the user picked this. Always adopted.
   *   adoptCompatibilityMode(mode, src)  a surface reported its own projection
   *                                      back to us. Adopted only if it would
   *                                      actually change what the user sees.
   *
   * Why the echo guard compares EFFECTIVE modes rather than special-casing
   * 'oled': every canonical value that is invisible downstream has this problem,
   * not just OLED. With canonical 'system' resolving dark, a Panel repaint or a
   * ChatGPT dialog read both report "dark" — adopting that would silently convert
   * a follow-the-OS preference into a hard dark preference. Comparing effective
   * modes covers 'system' and 'oled' with one rule.
   *
   *   canonical oled   + echo 'dark'   → no-op   (dark IS oled's projection)
   *   canonical oled   + intent 'dark' → dark    (user chose it)
   *   canonical system + echo 'dark'   → no-op   (dark IS system's projection today)
   *   canonical system + intent 'dark' → dark    (user pinned it)
   *   canonical oled   + echo 'light'  → light   (a real divergence, adopt it)
   * ═══════════════════════════════════════════ */

  function requestMode(mode) {
    if (!isValidMode(mode)) {
      try { console.warn(`[h2o-theme] H2O.theme.requestMode rejected invalid mode '${mode}'.`); } catch (_) {}
      return false;
    }
    return setModeActive(mode);
  }

  function adoptCompatibilityMode(mode, source) {
    if (!isValidMode(mode)) {
      try { console.warn(`[h2o-theme] H2O.theme.adoptCompatibilityMode rejected invalid mode '${mode}' from '${source || 'unknown'}'.`); } catch (_) {}
      return false;
    }
    if (resolveEffectiveMode(mode) === resolveEffectiveMode(currentState.mode)) {
      return true; // echo of our own projection — canonical intent preserved
    }
    return setModeActive(mode);
  }

  // Effective value a controller should DISPLAY as selected. Canonical-only modes
  // surface as their projection so 'oled' never leaks into a UI vocabulary.
  function compatMode() { return resolveEffectiveMode(currentState.mode); }

  // Value safe to hand to ChatGPT's own Appearance picker. That picker offers
  // System / Light / Dark only; queueing 'oled' would match no option, so the
  // pending entry would never clear and would be retried on every DOM mutation.
  function nativeMode(mode) {
    const raw = String(mode == null ? currentState.mode : mode).trim().toLowerCase();
    if (NATIVE_SUPPORTED_MODES.indexOf(raw) !== -1) return raw;
    return isValidMode(raw) ? resolveEffectiveMode(raw) : resolveEffectiveMode(currentState.mode);
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

    // Reads — mode projections for controller UIs.
    compatMode,                 // effective value a controller should show as selected
    nativeMode,                 // value safe for ChatGPT's own Appearance picker
    isCanonicalOnlyMode,        // 'oled' — canonical, but not representable in any UI
    isPageThemeEnabled() { return pageThemeEnabled; },

    // Writes — Phase 2A: only mode is active.
    set:             setActive,
    setMode:         setModeActive,
    requestMode,                // genuine user intent — always adopted
    adoptCompatibilityMode,     // surface echo — adopted only if visually different
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
