// ==UserScript==
// @h2o-id             0z1g.markup.tab.control.hub.plugin
// @name               0Z1g.⚫️🖌️🕹️ Markup Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.markup.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Markup tab controls into Control Hub via plugin API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';
  const EV_SECTION_BANDS_AUTO = 'h2o:section-bands:auto-mode';
  const MARK = '__H2O_CHUB_MARKUP_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';
  let ATTR_CGXUI = 'data-cgxui';
  let ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  let ATTR_CGXUI_STATE = 'data-cgxui-state';
  let SECTION_BANDS_BTN = null;
  let SECTION_BANDS_AUTO_BOUND = false;

  const FEATURE_KEY_MARKUP = 'markup';
  const FEATURE_KEY_SECTION_BANDS = 'sectionBands';
  const KEY_CHUB_MARKUP_SUBTAB_V1 = 'h2o:prm:cgx:cntrlhb:state:markup:subtab:v1';
  const KEY_SECTION_BANDS_BINDINGS_V1 = 'h2o:prm:cgx:sctnbnds:cfg:bindings:v1';
  const KEY_SECTION_BANDS_PALETTE_V1 = 'h2o:prm:cgx:sctnbnds:cfg:palette:v1';
  const CHUB_SB_PALETTE_DEFAULTS = Object.freeze([
    Object.freeze({ key: 'olive',  label: 'Color 1', hex: '#78866b' }),
    Object.freeze({ key: 'gold',   label: 'Color 2', hex: '#ebc86e' }),
    Object.freeze({ key: 'red',    label: 'Color 3', hex: '#cd5a5a' }),
    Object.freeze({ key: 'blue',   label: 'Color 4', hex: '#5c91c8' }),
    Object.freeze({ key: 'purple', label: 'Color 5', hex: '#9273c8' }),
  ]);
  const CHUB_SB_APPLY_START_DEFAULT = 'default';
  const CHUB_SB_APPLY_START_MODES = Object.freeze([
    ['default', 'Default Color'],
    ['same_last', 'Same As Last Used'],
    ['next_after_last', 'Next After Last Used'],
  ]);

  const MARKUP_META = Object.freeze({
    key: FEATURE_KEY_MARKUP,
    label: 'Markup',
    icon: '🖌️',
    subtitle: 'Highlighting + section band controls in one place.',
    category: 'mark',
    insertBefore: 'annotations',
    description: Object.freeze({
      default: 'Keep the main reading markup tools together under one tab.',
      focus: 'Switch between inline highlights and section bands without leaving the markup area.',
      review: 'Tune marking tools side by side while reviewing long answers.',
      performance: 'Consolidate markup controls so the hub stays organized while features stay unchanged.',
    }),
  });

  const MARKUP_SUBTABS = Object.freeze([
    Object.freeze({
      key: 'inlineHighlighter',
      label: 'Highlighter',
      icon: '🖌️',
      subtitle: 'Sentence-level highlights and inline tools.',
      description: Object.freeze({
        default: 'Standard palette + shortcuts.',
        focus: 'Stronger emphasis colors.',
        review: 'Mark summary sentences.',
        performance: 'Minimal DOM / animations.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_SECTION_BANDS,
      label: 'Section Bands',
      icon: '🧱',
      subtitle: 'Colored bands grouping answer sections.',
      description: Object.freeze({
        default: 'Soft, readable bands.',
        focus: 'High-contrast focus blocks.',
        review: 'Clear big-chunk separation.',
        performance: 'Subtle, low-cost bands.',
      }),
    }),
  ]);

  function getApi() {
    try {
      const root = TOPW.H2O || W.H2O;
      if (!root) return null;

      const isHubApi = (api) => api && typeof api.registerPlugin === 'function';
      const fast = [
        root?.CH?.cnhb,
        root?.CHUB?.cnhb,
        root?.CGX?.cnhb,
        root?.CH?.cntrlhb,
        root?.CHUB?.cntrlhb,
        root?.CHUB?.chub,
        root?.CGX?.cntrlhb,
        root?.CGX?.chub,
      ];

      for (const node of fast) {
        const api = node?.api;
        if (isHubApi(api)) return api;
      }

      for (const tok of Object.keys(root)) {
        const bucket = root[tok];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const pid of Object.keys(bucket)) {
          const api = bucket?.[pid]?.api;
          if (isHubApi(api)) return api;
        }
      }
    } catch {}
    return null;
  }

  function safeCall(label, fn) {
    try { return fn(); } catch (error) { try { console.warn('[H2O MarkupTab] ' + label, error); } catch {} }
    return undefined;
  }

  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function CHUB_invalidateSoon() {
    invalidate();
  }

  function markupCssText(skin = {}) {
    const P = skin.panelSel || '[data-cgxui="cnhb-panel"][data-cgxui-owner="cnhb"]';
    const stateAttr = skin.ATTR_CGXUI_STATE || ATTR_CGXUI_STATE;
    return `
${P} .${CLS}-sbPaletteEditor{
  display:grid;
  gap:10px;
  width:min(100%, 560px);
  max-width:100%;
}
${P} .${CLS}-sbPaletteHint{max-width:680px}
${P} .${CLS}-sbPaletteList{display:grid; gap:10px}
${P} .${CLS}-sbPaletteRow{
  display:grid;
  grid-template-columns:92px minmax(0, 1fr) auto;
  gap:8px;
  align-items:center;
  padding:8px 10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04), 0 8px 20px rgba(0,0,0,.16);
}
${P} .${CLS}-sbPaletteLead{display:flex; align-items:center; gap:8px; min-width:0}
${P} .${CLS}-sbPaletteIndex{
  width:24px;
  height:24px;
  border-radius:999px;
  display:grid;
  place-items:center;
  font-size:10px;
  font-weight:700;
  color:rgba(255,255,255,.96);
  background:linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06));
  border:1px solid rgba(255,255,255,.14);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
}
${P} .${CLS}-sbPaletteSwatch{
  width:38px;
  height:38px;
  padding:0;
  border-radius:11px;
  border:1px solid rgba(255,255,255,.16);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 6px 16px rgba(0,0,0,.18);
  cursor:pointer;
  transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
${P} .${CLS}-sbPaletteSwatch:hover{
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.26);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.24), 0 9px 18px rgba(0,0,0,.22);
}
${P} .${CLS}-sbPalettePickerHidden{
  position:absolute;
  width:0;
  height:0;
  opacity:0;
  pointer-events:none;
}
${P} .${CLS}-sbPaletteHex{width:100%; min-width:0}
${P} .${CLS}-sbPaletteTail{display:flex; align-items:center; gap:8px; justify-content:flex-end}
${P} .${CLS}-sbPalettePos{
  width:72px;
  min-width:72px;
  text-align:center;
}
${P} .${CLS}-sbPaletteMoves{display:flex; align-items:center; justify-content:flex-end; gap:8px}
${P} .${CLS}-sbPaletteMoveBtn{
  width:28px;
  height:28px;
  border-radius:9px;
  border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  color:#f4f6fb;
  font-size:14px;
  line-height:1;
  cursor:pointer;
  transition:transform .18s ease, border-color .18s ease, background .18s ease;
}
${P} .${CLS}-sbPaletteMoveBtn:hover:not(:disabled){
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.24);
  background:linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.06));
}
${P} .${CLS}-sbPaletteMoveBtn:disabled{opacity:.38; cursor:not-allowed}
${P} .${CLS}-sbPaletteActions{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
${P} .${CLS}-hlPaletteEditor .${CLS}-sbPaletteRow{
  grid-template-columns:minmax(160px, 220px) minmax(0, 1fr);
}
${P} .${CLS}-hlPalettePicker{
  width:42px;
  height:38px;
  padding:0;
  border-radius:11px;
  border:1px solid rgba(255,255,255,.16);
  background:transparent;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 6px 16px rgba(0,0,0,.18);
  cursor:pointer;
}
${P} .${CLS}-hlPalettePicker::-webkit-color-swatch-wrapper{
  padding:0;
  border-radius:10px;
}
${P} .${CLS}-hlPalettePicker::-webkit-color-swatch{
  border:none;
  border-radius:10px;
}
${P} .${CLS}-hlPaletteGroupTitle{
  font-size:11px;
  letter-spacing:.06em;
  text-transform:uppercase;
  opacity:.78;
  margin-top:4px;
}
${P} .${CLS}-hlPaletteLabel{
  font-size:12px;
  font-weight:600;
  color:rgba(255,255,255,.92);
}
@media (max-width: 760px){
${P} .${CLS}-sbPaletteRow{
  grid-template-columns:1fr;
}
${P} .${CLS}-sbPaletteTail{
  justify-content:flex-start;
}
${P} .${CLS}-sbPaletteMoves{
  justify-content:flex-start;
}
}
${P} .${CLS}-band-toggle-row{margin-top:8px}
${P} .${CLS}-band-toggle{
  border:1px solid rgba(255,255,255,.25);
  border-radius:999px;
  padding:6px 16px;
  min-width: 150px;
  font-size:12px;
  letter-spacing:.04em;
  background:rgba(255,255,255,.06);
  color:#fefefe;
  cursor:pointer;
  transition:all .18s ease;
  box-shadow:0 2px 6px rgba(0,0,0,.35);
}
${P} .${CLS}-band-toggle[${stateAttr}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,215,0,.9);
  color:#2d1605;
  box-shadow:0 10px 24px rgba(255,200,80,.45);
}
${P} .${CLS}-band-toggle:disabled{
  opacity:.65;
  filter:grayscale(.15);
  cursor:not-allowed;
}
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-band-toggle[${stateAttr}="on"]{
  background:linear-gradient(135deg,#ffb24a,#f97316 68%,#d95b0a);
  border-color:rgba(255,194,128,.92);
  box-shadow:0 0 0 1px rgba(255,236,214,.50), 0 0 14px rgba(249,115,22,.48);
}
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-band-toggle[${stateAttr}="on"]{
  background:linear-gradient(135deg,#28e4df,#078bd5 70%,#075ba8);
  border-color:rgba(165,241,255,.80);
  box-shadow:0 0 0 1px rgba(185,247,255,.45), 0 0 14px rgba(0,154,220,.42);
}
`;
  }

  function CHUB_SB_bindingsApi(){
    return W.H2O?.SB?.sctnbnds?.api?.bindings || null;
  }

  function CHUB_SB_paletteApi(){
    return W.H2O?.SB?.sctnbnds?.api?.paletteConfig || null;
  }

  function CHUB_SB_readBindingsStore(){
    try { return JSON.parse(localStorage.getItem(KEY_SECTION_BANDS_BINDINGS_V1) || '{}') || {}; } catch { return {}; }
  }

  function CHUB_SB_writeBindingsStore(next){
    try { localStorage.setItem(KEY_SECTION_BANDS_BINDINGS_V1, JSON.stringify(next || {})); } catch {}
  }

  function CHUB_SB_getBinding(key, fallback){
    const api = CHUB_SB_bindingsApi();
    if (api && typeof api.getBinding === 'function') {
      const live = api.getBinding(key);
      if (live != null) return live;
    }
    const raw = CHUB_SB_readBindingsStore();
    return String(raw?.[key] ?? fallback ?? 'none');
  }

  function CHUB_SB_setBinding(key, value){
    const api = CHUB_SB_bindingsApi();
    if (api && typeof api.setBinding === 'function') {
      api.setBinding(key, value);
      return;
    }
    const raw = CHUB_SB_readBindingsStore();
    raw[key] = value;
    CHUB_SB_writeBindingsStore(raw);
  }

  function CHUB_SB_normalizeHexColor(raw, fallback = null){
    const base = String(raw || '').trim().replace(/^#/, '');
    const expanded = /^[\da-f]{3}$/i.test(base)
      ? base.split('').map((ch) => ch + ch).join('')
      : base;
    if (!/^[\da-f]{6}$/i.test(expanded)) return fallback;
    return `#${expanded.toLowerCase()}`;
  }

  function CHUB_SB_normalizePaletteConfig(raw){
    const colors = CHUB_SB_PALETTE_DEFAULTS.map((fallback, idx) => {
      const incoming = Array.isArray(raw?.colors) ? raw.colors[idx] : null;
      return {
        key: fallback.key,
        label: `Color ${idx + 1}`,
        hex: CHUB_SB_normalizeHexColor(incoming?.hex, fallback.hex),
      };
    });
    const keys = colors.map((color) => color.key);
    const defaultKey = keys.includes(raw?.defaultKey) ? raw.defaultKey : CHUB_SB_PALETTE_DEFAULTS[0].key;
    const applyStartMode = CHUB_SB_APPLY_START_MODES.some(([value]) => value === raw?.applyStartMode)
      ? raw.applyStartMode
      : CHUB_SB_APPLY_START_DEFAULT;
    const lastUsedKey = keys.includes(raw?.lastUsedKey) ? raw.lastUsedKey : null;
    return { colors, defaultKey, applyStartMode, lastUsedKey };
  }

  function CHUB_SB_readPaletteStore(){
    try {
      return CHUB_SB_normalizePaletteConfig(JSON.parse(localStorage.getItem(KEY_SECTION_BANDS_PALETTE_V1) || '{}') || {});
    } catch {
      return CHUB_SB_normalizePaletteConfig(null);
    }
  }

  function CHUB_SB_writePaletteStore(next){
    try { localStorage.setItem(KEY_SECTION_BANDS_PALETTE_V1, JSON.stringify(CHUB_SB_normalizePaletteConfig(next))); } catch {}
  }

  function CHUB_SB_getPaletteConfig(){
    const api = CHUB_SB_paletteApi();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_SB_normalizePaletteConfig(api.getConfig()); } catch {}
    }
    return CHUB_SB_readPaletteStore();
  }

  function CHUB_SB_setPaletteConfig(next){
    const api = CHUB_SB_paletteApi();
    if (api && typeof api.setConfig === 'function') {
      try { return CHUB_SB_normalizePaletteConfig(api.setConfig(next || {})); } catch {}
    }
    const current = CHUB_SB_readPaletteStore();
    const merged = CHUB_SB_normalizePaletteConfig({
      colors: Array.isArray(next?.colors) ? next.colors : current.colors,
      defaultKey: next?.defaultKey ?? current.defaultKey,
      applyStartMode: next?.applyStartMode ?? current.applyStartMode,
      lastUsedKey: next?.lastUsedKey ?? current.lastUsedKey,
    });
    CHUB_SB_writePaletteStore(merged);
    return merged;
  }

  function CHUB_SB_resetPaletteConfig(){
    const api = CHUB_SB_paletteApi();
    if (api && typeof api.resetConfig === 'function') {
      try { return CHUB_SB_normalizePaletteConfig(api.resetConfig()); } catch {}
    }
    const reset = CHUB_SB_normalizePaletteConfig(null);
    CHUB_SB_writePaletteStore(reset);
    return reset;
  }

  function CHUB_SB_defaultColorOpts(){
    const cfg = CHUB_SB_getPaletteConfig();
    return cfg.colors.map((color, idx) => [
      color.key,
      `Color ${idx + 1} (${String(color.hex || '').toUpperCase()})`,
    ]);
  }

  function CHUB_SB_applyStartOpts(){
    return CHUB_SB_APPLY_START_MODES.slice();
  }

  function CHUB_SB_popupMouseOpts(){
    return [
      ['left_click','Left click'],
      ['middle_click','Middle click'],
      ['right_click','Right click'],
      ['left_double','Double-left'],
      ['middle_double','Double-middle'],
      ['right_double','Double-right'],
      ['none','None'],
    ];
  }

  function CHUB_SB_applyKeyOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['meta_1','Cmd+1'],
      ['meta_h','Cmd+H'],
      ['ctrl_1','Ctrl+1'],
      ['ctrl_h','Ctrl+H'],
      ['meta_or_ctrl_1','Cmd/Ctrl+1'],
      ['meta_or_ctrl_h','Cmd/Ctrl+H'],
      ['none','None'],
    ];
  }

  function CHUB_SB_clearKeyOpts(){
    return [
      ['meta_z','Cmd+Z'],
      ['ctrl_z','Ctrl+Z'],
      ['meta_or_ctrl_z','Cmd/Ctrl+Z'],
      ['escape','Escape'],
      ['none','None'],
    ];
  }

  function CHUB_SB_repeatOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['enter_backspace','Enter / Backspace'],
      ['arrow_lr','Arrow Left / Right'],
      ['arrow_ud','Arrow Up / Down'],
      ['none','None'],
    ];
  }

  function CHUB_SB_modeOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['arrow_lr','Arrow Left / Right'],
      ['arrow_ud','Arrow Up / Down'],
      ['meta_x','Cmd+X'],
      ['ctrl_x','Ctrl+X'],
      ['meta_or_ctrl_x','Cmd/Ctrl+X'],
      ['meta_v','Cmd+V'],
      ['ctrl_v','Ctrl+V'],
      ['meta_or_ctrl_v','Cmd/Ctrl+V'],
      ['none','None'],
    ];
  }

  function CHUB_SB_patternPickOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['meta_x','Cmd+X'],
      ['ctrl_x','Ctrl+X'],
      ['meta_or_ctrl_x','Cmd/Ctrl+X'],
      ['meta_v','Cmd+V'],
      ['ctrl_v','Ctrl+V'],
      ['meta_or_ctrl_v','Cmd/Ctrl+V'],
      ['escape','Escape'],
      ['none','None'],
    ];
  }

  function CHUB_SB_patternRotateOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['enter_backspace','Enter / Backspace'],
      ['arrow_lr','Arrow Left / Right'],
      ['arrow_ud','Arrow Up / Down'],
      ['meta_x','Cmd+X'],
      ['ctrl_x','Ctrl+X'],
      ['meta_or_ctrl_x','Cmd/Ctrl+X'],
      ['escape','Escape'],
      ['none','None'],
    ];
  }

  function CHUB_SB_refreshSectionBandControls(panel){
    if (!panel) return;
    CHUB_invalidateSoon();
  }

  function CHUB_SB_movePaletteColor(colors, fromIdx, toIdx){
    const list = Array.isArray(colors) ? colors.slice() : [];
    if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length || fromIdx === toIdx) return list;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    return list.map((color, idx) => ({
      key: CHUB_SB_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
      label: `Color ${idx + 1}`,
      hex: CHUB_SB_normalizeHexColor(color?.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
    }));
  }

  function CHUB_SB_renderPaletteEditor({ panel }){
    const cfg = CHUB_SB_getPaletteConfig();
    const root = D.createElement('div');
    root.className = `${CLS}-sbPaletteEditor`;

    const tip = D.createElement('div');
    tip.className = `${CLS}-ctrlHint ${CLS}-sbPaletteHint`;
    tip.textContent = 'Edit the 5 loop colors here. Existing section bands update when you apply.';
    root.appendChild(tip);

    let draftColors = cfg.colors.map((color, idx) => ({
      key: CHUB_SB_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
      label: `Color ${idx + 1}`,
      hex: CHUB_SB_normalizeHexColor(color?.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
    }));

    const list = D.createElement('div');
    list.className = `${CLS}-sbPaletteList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;

    const applyBtn = D.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = `${CLS}-actionBtn primary`;
    applyBtn.textContent = 'Apply';

    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset';

    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';
    status.textContent = '';

    const renderRows = () => {
      list.textContent = '';

      draftColors.forEach((color, idx) => {
        const row = D.createElement('div');
        row.className = `${CLS}-sbPaletteRow`;

        const lead = D.createElement('div');
        lead.className = `${CLS}-sbPaletteLead`;

        const index = D.createElement('span');
        index.className = `${CLS}-sbPaletteIndex`;
        index.textContent = String(idx + 1);

        const picker = D.createElement('input');
        picker.type = 'color';
        picker.className = `${CLS}-sbPalettePickerHidden`;
        picker.value = CHUB_SB_normalizeHexColor(color.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888');

        const swatch = D.createElement('button');
        swatch.type = 'button';
        swatch.className = `${CLS}-sbPaletteSwatch`;
        swatch.title = `Pick Color ${idx + 1}`;
        swatch.style.background = picker.value;

        const code = D.createElement('input');
        code.type = 'text';
        code.value = String(picker.value || '').toUpperCase();
        code.maxLength = 7;
        code.spellcheck = false;
        code.autocomplete = 'off';
        code.className = `${CLS}-select2 ${CLS}-sbPaletteHex`;

        const pos = D.createElement('select');
        pos.className = `${CLS}-select2 ${CLS}-sbPalettePos`;
        for (let slot = 1; slot <= CHUB_SB_PALETTE_DEFAULTS.length; slot++) {
          const opt = D.createElement('option');
          opt.value = String(slot - 1);
          opt.textContent = String(slot);
          pos.appendChild(opt);
        }
        pos.value = String(idx);

        const tail = D.createElement('div');
        tail.className = `${CLS}-sbPaletteTail`;

        const moveWrap = D.createElement('div');
        moveWrap.className = `${CLS}-sbPaletteMoves`;

        const mkMoveBtn = (txt, title, disabled, onClick) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-sbPaletteMoveBtn`;
          btn.textContent = txt;
          btn.title = title;
          btn.disabled = disabled;
          btn.addEventListener('click', onClick, true);
          return btn;
        };

        const moveLeftBtn = mkMoveBtn('←', 'Move earlier in the loop', idx === 0, () => {
          draftColors = CHUB_SB_movePaletteColor(draftColors, idx, idx - 1);
          renderRows();
        });
        const moveRightBtn = mkMoveBtn('→', 'Move later in the loop', idx === (draftColors.length - 1), () => {
          draftColors = CHUB_SB_movePaletteColor(draftColors, idx, idx + 1);
          renderRows();
        });

        swatch.addEventListener('click', (evt) => {
          evt.preventDefault();
          picker.click();
        }, true);

        picker.addEventListener('input', () => {
          const nextHex = CHUB_SB_normalizeHexColor(picker.value, draftColors[idx]?.hex || picker.value);
          draftColors[idx] = Object.assign({}, draftColors[idx], { hex: nextHex });
          swatch.style.background = nextHex;
          code.value = String(nextHex || '').toUpperCase();
        }, true);

        code.addEventListener('input', () => {
          const normalized = CHUB_SB_normalizeHexColor(code.value, null);
          if (!normalized) return;
          draftColors[idx] = Object.assign({}, draftColors[idx], { hex: normalized });
          picker.value = normalized;
          swatch.style.background = normalized;
        }, true);

        code.addEventListener('blur', () => {
          const normalized = CHUB_SB_normalizeHexColor(code.value, draftColors[idx]?.hex || picker.value);
          draftColors[idx] = Object.assign({}, draftColors[idx], { hex: normalized });
          picker.value = normalized;
          swatch.style.background = normalized;
          code.value = String(normalized || '').toUpperCase();
        }, true);

        pos.addEventListener('change', () => {
          draftColors = CHUB_SB_movePaletteColor(draftColors, idx, parseInt(pos.value, 10));
          renderRows();
        }, true);

        lead.append(index, swatch, picker);
        moveWrap.append(moveLeftBtn, moveRightBtn);
        tail.append(pos, moveWrap);
        row.append(lead, code, tail);
        list.appendChild(row);
      });
    };

    applyBtn.addEventListener('click', () => {
      const colors = draftColors.map((color, idx) => ({
        key: CHUB_SB_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
        label: `Color ${idx + 1}`,
        hex: CHUB_SB_normalizeHexColor(color?.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
      }));
      CHUB_SB_setPaletteConfig({ colors });
      status.textContent = 'Palette updated.';
      CHUB_SB_refreshSectionBandControls(panel);
    }, true);

    resetBtn.addEventListener('click', () => {
      CHUB_SB_resetPaletteConfig();
      status.textContent = 'Palette reset.';
      CHUB_SB_refreshSectionBandControls(panel);
    }, true);

    renderRows();
    actionRow.append(applyBtn, resetBtn, status);
    root.appendChild(actionRow);
    return root;
  }


  const KEY_INLINE_HL_CFG_UI_V1 = 'h2o:prm:cgx:nlnhghlghtr:cfg:ui:v1';
  const CHUB_HL_PALETTE_DEFAULTS = Object.freeze([
    Object.freeze({ title: 'blue',   label: 'Blue',   group: 'primary',   pair: 'sky',    color: '#3B82F6' }),
    Object.freeze({ title: 'red',    label: 'Red',    group: 'primary',   pair: 'pink',   color: '#FF4C4C' }),
    Object.freeze({ title: 'green',  label: 'Green',  group: 'primary',   pair: 'purple', color: '#22C55E' }),
    Object.freeze({ title: 'gold',   label: 'Gold',   group: 'primary',   pair: 'orange', color: '#FFD54F' }),
    Object.freeze({ title: 'sky',    label: 'Sky',    group: 'secondary', pair: 'blue',   color: '#7DD3FC' }),
    Object.freeze({ title: 'pink',   label: 'Pink',   group: 'secondary', pair: 'red',    color: '#F472B6' }),
    Object.freeze({ title: 'purple', label: 'Purple', group: 'secondary', pair: 'green',  color: '#A855F7' }),
    Object.freeze({ title: 'orange', label: 'Orange', group: 'secondary', pair: 'gold',   color: '#FF914D' }),
  ]);
  const CHUB_HL_DEFAULTS = Object.freeze({
    applyShortcut: 'meta_or_ctrl_1',
    clearShortcut: 'meta_or_ctrl_z',
    popupTrigger: 'middle_click',
    shortcutColorMode: 'current_color',
    defaultColor: 'gold',
  });
  const CHUB_HL_APPLY_SHORTCUTS = Object.freeze(['meta_or_ctrl_1', 'meta_1', 'ctrl_1', 'meta_or_ctrl_shift_1', 'none']);
  const CHUB_HL_CLEAR_SHORTCUTS = Object.freeze(['meta_or_ctrl_z', 'meta_z', 'ctrl_z', 'escape', 'backspace', 'delete', 'none']);
  const CHUB_HL_POPUP_TRIGGERS = Object.freeze(['hover', 'click', 'middle_click', 'right_click', 'none']);
  const CHUB_HL_START_MODES = Object.freeze(['default_color', 'first_primary', 'current_color', 'next_primary', 'paired_secondary', 'random']);

  function CHUB_HL_api() {
    return W.H2O?.HE?.nlnhghlghtr?.api || W.H2OInline || null;
  }

  function CHUB_HL_normalizeHexColor(raw, fallback = null) {
    const base = String(raw || '').trim().replace(/^#/, '');
    const expanded = /^[\da-f]{3}$/i.test(base)
      ? base.split('').map((ch) => ch + ch).join('')
      : base;
    if (!/^[\da-f]{6}$/i.test(expanded)) return fallback;
    return `#${expanded.toLowerCase()}`;
  }

  function CHUB_HL_findPaletteEntry(rawPalette, title, idx) {
    if (!Array.isArray(rawPalette)) return null;
    const byTitle = rawPalette.find((entry) => String(entry?.title || entry?.key || '').trim().toLowerCase() === title);
    if (byTitle) return byTitle;
    return rawPalette[idx] || null;
  }

  function CHUB_HL_normalizeConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const palette = CHUB_HL_PALETTE_DEFAULTS.map((fallback, idx) => {
      const incoming = CHUB_HL_findPaletteEntry(src.palette, fallback.title, idx);
      return {
        title: fallback.title,
        label: fallback.label,
        group: fallback.group,
        pair: fallback.pair,
        color: CHUB_HL_normalizeHexColor(incoming?.color || incoming?.hex, fallback.color),
      };
    });
    const names = palette.map((entry) => entry.title);
    return {
      applyShortcut: CHUB_HL_APPLY_SHORTCUTS.includes(src.applyShortcut) ? src.applyShortcut : CHUB_HL_DEFAULTS.applyShortcut,
      clearShortcut: CHUB_HL_CLEAR_SHORTCUTS.includes(src.clearShortcut) ? src.clearShortcut : CHUB_HL_DEFAULTS.clearShortcut,
      popupTrigger: CHUB_HL_POPUP_TRIGGERS.includes(src.popupTrigger) ? src.popupTrigger : CHUB_HL_DEFAULTS.popupTrigger,
      shortcutColorMode: CHUB_HL_START_MODES.includes(src.shortcutColorMode) ? src.shortcutColorMode : CHUB_HL_DEFAULTS.shortcutColorMode,
      defaultColor: names.includes(String(src.defaultColor || '').trim().toLowerCase()) ? String(src.defaultColor).trim().toLowerCase() : CHUB_HL_DEFAULTS.defaultColor,
      palette,
    };
  }

  function CHUB_HL_readStore() {
    try {
      return CHUB_HL_normalizeConfig(JSON.parse(localStorage.getItem(KEY_INLINE_HL_CFG_UI_V1) || '{}') || {});
    } catch {
      return CHUB_HL_normalizeConfig(null);
    }
  }

  function CHUB_HL_writeStore(next) {
    try { localStorage.setItem(KEY_INLINE_HL_CFG_UI_V1, JSON.stringify(CHUB_HL_normalizeConfig(next))); } catch {}
  }

  function CHUB_HL_getConfig() {
    const api = CHUB_HL_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_HL_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_HL_readStore();
  }

  function CHUB_HL_applySetting(key, value) {
    const api = CHUB_HL_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_HL_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_HL_normalizeConfig({ ...CHUB_HL_readStore(), [key]: value });
    CHUB_HL_writeStore(merged);
    return merged;
  }

  function CHUB_HL_getPaletteConfig() {
    const api = CHUB_HL_api();
    const paletteApi = api?.paletteConfig || null;
    if (paletteApi && typeof paletteApi.getConfig === 'function') {
      try {
        const current = CHUB_HL_getConfig();
        return CHUB_HL_normalizeConfig({ ...current, ...paletteApi.getConfig() });
      } catch {}
    }
    return CHUB_HL_readStore();
  }

  function CHUB_HL_setPaletteConfig(next) {
    const api = CHUB_HL_api();
    const paletteApi = api?.paletteConfig || null;
    if (paletteApi && typeof paletteApi.setConfig === 'function') {
      try {
        const current = CHUB_HL_getConfig();
        return CHUB_HL_normalizeConfig({ ...current, ...paletteApi.setConfig(next || {}) });
      } catch {}
    }
    const current = CHUB_HL_readStore();
    const merged = CHUB_HL_normalizeConfig({
      ...current,
      defaultColor: next?.defaultColor ?? current.defaultColor,
      palette: Array.isArray(next?.palette) ? next.palette : current.palette,
    });
    CHUB_HL_writeStore(merged);
    return merged;
  }

  function CHUB_HL_resetPaletteConfig() {
    const api = CHUB_HL_api();
    const paletteApi = api?.paletteConfig || null;
    if (paletteApi && typeof paletteApi.resetConfig === 'function') {
      try {
        const current = CHUB_HL_getConfig();
        return CHUB_HL_normalizeConfig({ ...current, ...paletteApi.resetConfig() });
      } catch {}
    }
    const current = CHUB_HL_readStore();
    const reset = CHUB_HL_normalizeConfig({
      ...current,
      palette: CHUB_HL_PALETTE_DEFAULTS.map((entry) => ({ title: entry.title, color: entry.color })),
      defaultColor: CHUB_HL_DEFAULTS.defaultColor,
    });
    CHUB_HL_writeStore(reset);
    return reset;
  }

  function CHUB_HL_applyKeyOpts() {
    return [
      ['meta_or_ctrl_1', 'Cmd/Ctrl+1'],
      ['meta_1', 'Cmd+1'],
      ['ctrl_1', 'Ctrl+1'],
      ['meta_or_ctrl_shift_1', 'Cmd/Ctrl+Shift+1'],
      ['none', 'None'],
    ];
  }

  function CHUB_HL_clearKeyOpts() {
    return [
      ['meta_or_ctrl_z', 'Cmd/Ctrl+Z'],
      ['meta_z', 'Cmd+Z'],
      ['ctrl_z', 'Ctrl+Z'],
      ['escape', 'Escape'],
      ['backspace', 'Backspace'],
      ['delete', 'Delete'],
      ['none', 'None'],
    ];
  }

  function CHUB_HL_popupTriggerOpts() {
    return [
      ['hover', 'Hover'],
      ['click', 'Mouse click'],
      ['middle_click', 'Middle click'],
      ['right_click', 'Right click'],
      ['none', 'None'],
    ];
  }

  function CHUB_HL_startColorOpts() {
    return [
      ['default_color', 'Default Color'],
      ['first_primary', 'First Primary Color'],
      ['current_color', 'Last Used Color'],
      ['next_primary', 'Next Primary After Last Used'],
      ['paired_secondary', 'Matching Secondary To Last Used'],
      ['random', 'Random Color'],
    ];
  }

  function CHUB_HL_defaultColorOpts() {
    return CHUB_HL_getPaletteConfig().palette.map((entry) => [
      entry.title,
      `${entry.label} (${String(entry.color || '').toUpperCase()})`,
    ]);
  }

  function CHUB_HL_clearCurrentChat() {
    const api = CHUB_HL_api();
    if (api && typeof api.clearCurrentChat === 'function') {
      return Promise.resolve(api.clearCurrentChat());
    }
    return Promise.resolve({ message: 'Highlighter module unavailable.' });
  }

  function CHUB_HL_renderPaletteEditor() {
    const cfg = CHUB_HL_getPaletteConfig();
    const root = D.createElement('div');
    root.className = `${CLS}-sbPaletteEditor ${CLS}-hlPaletteEditor`;

    const tip = D.createElement('div');
    tip.className = `${CLS}-ctrlHint ${CLS}-sbPaletteHint`;
    tip.textContent = 'Primary colors are the main loop. Secondary colors are the paired alternates. Set each color with the picker or by typing a hex code.';
    root.appendChild(tip);

    const list = D.createElement('div');
    list.className = `${CLS}-sbPaletteList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;

    const applyBtn = D.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = `${CLS}-actionBtn primary`;
    applyBtn.textContent = 'Apply';

    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset';

    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';

    let draft = cfg.palette.map((entry) => ({
      title: entry.title,
      label: entry.label,
      group: entry.group,
      pair: entry.pair,
      color: CHUB_HL_normalizeHexColor(entry.color, '#888888'),
    }));

    const renderRows = () => {
      list.textContent = '';
      [['primary', 'Primary Colors'], ['secondary', 'Secondary Colors']].forEach(([groupKey, groupLabel]) => {
        const title = D.createElement('div');
        title.className = `${CLS}-hlPaletteGroupTitle`;
        title.textContent = groupLabel;
        list.appendChild(title);

        draft.filter((entry) => entry.group === groupKey).forEach((entry) => {
          const row = D.createElement('div');
          row.className = `${CLS}-sbPaletteRow`;

          const lead = D.createElement('div');
          lead.className = `${CLS}-sbPaletteLead`;

          const picker = D.createElement('input');
          picker.type = 'color';
          picker.className = `${CLS}-hlPalettePicker`;
          picker.value = entry.color;
          picker.title = `Pick ${entry.label}`;

          const label = D.createElement('span');
          label.className = `${CLS}-hlPaletteLabel`;
          label.textContent = entry.label;

          const code = D.createElement('input');
          code.type = 'text';
          code.value = String(entry.color || '').toUpperCase();
          code.maxLength = 7;
          code.spellcheck = false;
          code.autocomplete = 'off';
          code.className = `${CLS}-select2 ${CLS}-sbPaletteHex`;

          const setColor = (raw, fallback) => {
            const nextHex = CHUB_HL_normalizeHexColor(raw, fallback);
            entry.color = nextHex;
            picker.value = nextHex;
            code.value = String(nextHex || '').toUpperCase();
          };

          picker.addEventListener('input', () => setColor(picker.value, entry.color), true);
          code.addEventListener('input', () => {
            const normalized = CHUB_HL_normalizeHexColor(code.value, null);
            if (normalized) setColor(normalized, entry.color);
          }, true);
          code.addEventListener('blur', () => setColor(code.value, entry.color), true);

          lead.append(picker, label);
          row.append(lead, code);
          list.appendChild(row);
        });
      });
    };

    applyBtn.addEventListener('click', () => {
      draft = CHUB_HL_setPaletteConfig({ palette: draft }).palette.map((entry) => ({
        title: entry.title,
        label: entry.label,
        group: entry.group,
        pair: entry.pair,
        color: entry.color,
      }));
      renderRows();
      status.textContent = 'Palette updated.';
    }, true);

    resetBtn.addEventListener('click', () => {
      draft = CHUB_HL_resetPaletteConfig().palette.map((entry) => ({
        title: entry.title,
        label: entry.label,
        group: entry.group,
        pair: entry.pair,
        color: entry.color,
      }));
      renderRows();
      status.textContent = 'Palette reset.';
    }, true);

    renderRows();
    actionRow.append(applyBtn, resetBtn, status);
    root.appendChild(actionRow);
    return root;
  }


  function CHUB_SB_autoModeApi(){
    const mod = W.H2O?.SB?.sctnbnds?.api;
    if (!mod) return null;
    return mod.autoMode || mod;
  }

  function CHUB_SB_autoMode(){
    const api = CHUB_SB_autoModeApi();
    if (!api) return null;
    if (typeof api.isAutoModeOn === 'function') return !!api.isAutoModeOn();
    return null;
  }

  function CHUB_SB_toggleAutoMode(){
    const api = CHUB_SB_autoModeApi();
    if (!api) return;
    if (typeof api.toggleAutoMode === 'function') {
      api.toggleAutoMode();
    } else if (typeof api.setAutoMode === 'function') {
      api.setAutoMode(!CHUB_SB_autoMode());
    }
    CHUB_SB_updateAutoModeButtonState();
  }

  function CHUB_SB_updateAutoModeButtonState(){
    const btn = SECTION_BANDS_BTN;
    if (!btn) return;
    const state = CHUB_SB_autoMode();
    if (state === null) {
      btn.disabled = true;
      btn.removeAttribute(ATTR_CGXUI_STATE);
      btn.textContent = 'Bands: Loading…';
      return;
    }
    btn.disabled = false;
    btn.setAttribute(ATTR_CGXUI_STATE, state ? 'on' : 'off');
    btn.textContent = state ? 'Bands: ◉' : 'Bands: ◎';
  }

  function CHUB_SB_bindAutoModeListener(){
    if (SECTION_BANDS_AUTO_BOUND) return;
    SECTION_BANDS_AUTO_BOUND = true;
    W.addEventListener(EV_SECTION_BANDS_AUTO, CHUB_SB_updateAutoModeButtonState, true);
  }

  function CHUB_SB_renderAutoModeControl(ctx = {}){
    if (ctx.row?.classList) {
      ctx.row.classList.remove(CLS + '-ctrlrow-action');
      ctx.row.classList.add(CLS + '-band-toggle-row');
    }
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = CLS + '-band-toggle';
    btn.setAttribute('aria-label', 'Toggle section bands auto-mode');
    btn.addEventListener('click', () => {
      CHUB_SB_toggleAutoMode();
    }, true);
    SECTION_BANDS_BTN = btn;
    CHUB_SB_updateAutoModeButtonState();
    return btn;
  }

  const INLINE_HIGHLIGHTER_CONTROLS = Object.freeze([
      {
        type:'select',
        key:'hlApplyShortcut',
        label:'Apply Highlight',
        group:'Shortcuts',
        help:'When text is selected, this shortcut applies a highlight using the configured start-color rule.',
        def:'meta_or_ctrl_1',
        opts: CHUB_HL_applyKeyOpts,
        getLive() { return CHUB_HL_getConfig().applyShortcut || 'meta_or_ctrl_1'; },
        setLive(v) { CHUB_HL_applySetting('applyShortcut', v); },
      },
      {
        type:'select',
        key:'hlClearShortcut',
        label:'Remove Highlight',
        group:'Shortcuts',
        help:'Removes highlights in the current text selection, or the last clicked/active highlight.',
        def:'meta_or_ctrl_z',
        opts: CHUB_HL_clearKeyOpts,
        getLive() { return CHUB_HL_getConfig().clearShortcut || 'meta_or_ctrl_z'; },
        setLive(v) { CHUB_HL_applySetting('clearShortcut', v); },
      },
      {
        type:'select',
        key:'hlPopupTrigger',
        label:'Popup On Highlight',
        group:'Popup',
        help:'Choose how the color popup opens when you interact with already-highlighted text.',
        def:'middle_click',
        opts: CHUB_HL_popupTriggerOpts,
        getLive() { return CHUB_HL_getConfig().popupTrigger || 'middle_click'; },
        setLive(v) { CHUB_HL_applySetting('popupTrigger', v); },
      },
      {
        type:'select',
        key:'hlShortcutColorMode',
        label:'Key Start Color',
        group:'Colors',
        help:'Controls which color the keyboard apply shortcut uses before you manually pick from the popup.',
        def:'current_color',
        opts: CHUB_HL_startColorOpts,
        getLive() { return CHUB_HL_getConfig().shortcutColorMode || 'current_color'; },
        setLive(v) { CHUB_HL_applySetting('shortcutColorMode', v); },
      },
      {
        type:'select',
        key:'hlDefaultColor',
        label:'Default Color',
        group:'Colors',
        help:'Used as the default starting color and as the fallback when the last-used color is unavailable.',
        def:'gold',
        opts: CHUB_HL_defaultColorOpts,
        getLive() { return CHUB_HL_getPaletteConfig().defaultColor || 'gold'; },
        setLive(v) { CHUB_HL_applySetting('defaultColor', v); },
      },
      {
        type:'custom',
        key:'hlPaletteEditor',
        label:'Palette Colors',
        group:'Colors',
        help:'Edit the four primary colors and their four secondary partner colors.',
        stackBelowLabel: true,
        render() { return CHUB_HL_renderPaletteEditor(); },
      },
      {
        type:'action',
        key:'hlClearCurrentChat',
        label:'Current Chat',
        group:'Actions',
        help:'Removes every inline highlight stored for the chat you have open right now.',
        statusText:'',
        buttons: [
          {
            label:'Clear All Highlights',
            primary:true,
            action: async () => {
              if (!W.confirm('Remove all highlights from the current chat?')) return { message: 'Canceled.' };
              return CHUB_HL_clearCurrentChat();
            },
            successText:'Highlights cleared.',
            errorText:'Failed to clear highlights.',
          },
        ],
      },
  ]);

  const SECTION_BANDS_CONTROLS_BASE = Object.freeze([
      {
        type:'select',
        key:'sbPopupMouse',
        label:'Popup Mouse',
        group:'Popup / Mouse',
        help:'Only opens on the left side of assistant sections, never elsewhere on the page.',
        def:'middle_double',
        opts: CHUB_SB_popupMouseOpts(),
        getLive() { return CHUB_SB_getBinding('popupMouse', 'middle_double'); },
        setLive(v) { CHUB_SB_setBinding('popupMouse', v); },
      },
      {
        type:'select',
        key:'sbDefaultColor',
        label:'Default Color',
        group:'Colors / Palette',
        help:'This is the first color in the loop and the default starting color.',
        def:'olive',
        opts: CHUB_SB_defaultColorOpts,
        getLive() { return CHUB_SB_getPaletteConfig().defaultKey || 'olive'; },
        setLive(v) { CHUB_SB_setPaletteConfig({ defaultKey: v }); },
      },
      {
        type:'select',
        key:'sbApplyStartMode',
        label:'Key Start Color',
        group:'Colors / Palette',
        help:'When Apply Color is used on an uncolored section, choose how the first color is picked.',
        def:'default',
        opts: CHUB_SB_applyStartOpts,
        getLive() { return CHUB_SB_getPaletteConfig().applyStartMode || 'default'; },
        setLive(v) { CHUB_SB_setPaletteConfig({ applyStartMode: v }); },
      },
      {
        type:'custom',
        key:'sbPaletteColors',
        label:'Palette Colors',
        group:'Colors / Palette',
        help:'Use the picker or type a hex code for each loop color.',
        stackBelowLabel: true,
        render(ctx) { return CHUB_SB_renderPaletteEditor(ctx); },
      },
      {
        type:'select',
        key:'sbApplyColor',
        label:'Apply Color',
        group:'Colors / Apply',
        help:'Keyboard shortcuts only act over hovered or selected assistant sections.',
        def:'space',
        opts: CHUB_SB_applyKeyOpts(),
        getLive() { return CHUB_SB_getBinding('applyColor', 'space'); },
        setLive(v) { CHUB_SB_setBinding('applyColor', v); },
      },
      {
        type:'select',
        key:'sbClearColor',
        label:'Clear Color',
        group:'Colors / Clear',
        def:'meta_or_ctrl_z',
        opts: CHUB_SB_clearKeyOpts(),
        getLive() { return CHUB_SB_getBinding('clearColor', 'meta_or_ctrl_z'); },
        setLive(v) { CHUB_SB_setBinding('clearColor', v); },
      },
      {
        type:'select',
        key:'sbRotateColor',
        label:'Rotate Colors',
        group:'Colors / Edit',
        def:'none',
        opts: CHUB_SB_repeatOpts(),
        getLive() { return CHUB_SB_getBinding('rotateColor', 'none'); },
        setLive(v) { CHUB_SB_setBinding('rotateColor', v); },
      },
      {
        type:'select',
        key:'sbIntensity',
        label:'Increase Intensity',
        group:'Colors / Edit',
        def:'arrow_ud',
        opts: CHUB_SB_repeatOpts(),
        getLive() { return CHUB_SB_getBinding('intensity', 'arrow_ud'); },
        setLive(v) { CHUB_SB_setBinding('intensity', v); },
      },
      {
        type:'select',
        key:'sbMode',
        label:'Fill / Frame',
        group:'Colors / Edit',
        def:'enter',
        opts: CHUB_SB_modeOpts(),
        getLive() { return CHUB_SB_getBinding('mode', 'enter'); },
        setLive(v) { CHUB_SB_setBinding('mode', v); },
      },
      {
        type:'select',
        key:'sbPatternPick',
        label:'Choose Pattern',
        group:'Patterns',
        def:'meta_or_ctrl_x',
        opts: CHUB_SB_patternPickOpts(),
        getLive() { return CHUB_SB_getBinding('choosePattern', 'meta_or_ctrl_x'); },
        setLive(v) { CHUB_SB_setBinding('choosePattern', v); },
      },
      {
        type:'select',
        key:'sbPatternRotate',
        label:'Rotate Pattern',
        group:'Patterns',
        def:'arrow_lr',
        opts: CHUB_SB_patternRotateOpts(),
        getLive() { return CHUB_SB_getBinding('rotatePattern', 'arrow_lr'); },
        setLive(v) { CHUB_SB_setBinding('rotatePattern', v); },
      },
  ]);

  const SECTION_BANDS_CONTROLS = Object.freeze([
    {
      type:'custom',
      key:'sbAutoMode',
      label:'Bands auto-mode',
      render(ctx) { return CHUB_SB_renderAutoModeControl(ctx); },
    },
    ...SECTION_BANDS_CONTROLS_BASE,
  ]);

  const CONTROLS_BY_KEY = Object.freeze({
    inlineHighlighter: INLINE_HIGHLIGHTER_CONTROLS,
    [FEATURE_KEY_SECTION_BANDS]: SECTION_BANDS_CONTROLS,
  });

  function applySkin(api) {
    let skin = null;
    try { skin = typeof api?.getSkin === 'function' ? api.getSkin() : null; } catch {}
    CLS = skin?.CLS || CLS;
    ATTR_CGXUI = skin?.ATTR_CGXUI || ATTR_CGXUI;
    ATTR_CGXUI_OWNER = skin?.ATTR_CGXUI_OWNER || ATTR_CGXUI_OWNER;
    ATTR_CGXUI_STATE = skin?.ATTR_CGXUI_STATE || ATTR_CGXUI_STATE;
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    CHUB_SB_bindAutoModeListener();
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      api.registerPlugin({
        key: FEATURE_KEY_MARKUP,
        title: 'Markup',
        meta: MARKUP_META,
        category: 'mark',
        subtabs: MARKUP_SUBTABS,
        subtabStorageKey: KEY_CHUB_MARKUP_SUBTAB_V1,
        visibility: {
          selectors: [
            '[data-cgxui-owner="scbn"]',
          ],
          hideCss: `
__ROOT__ .cgxui-inhl-hl-tools,
__ROOT__ .cgxui-inhl-hl-swatches,
__ROOT__ .cgxui-inhl-hl-swatch{
  display:none !important;
}
__ROOT__ .cgxui-inhl-inline-hl,
__ROOT__ mark.cgxui-inhl-inline-hl{
  background:transparent !important;
  color:inherit !important;
  border:0 !important;
  box-shadow:none !important;
  outline:none !important;
  text-decoration:none !important;
  padding:0 !important;
  border-radius:0 !important;
  filter:none !important;
}
`,
        },
        cssText: markupCssText,
      });
      api.registerPlugin({
        key: 'inlineHighlighter',
        getControls() {
          return CONTROLS_BY_KEY.inlineHighlighter;
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_SECTION_BANDS,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_SECTION_BANDS];
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O MarkupTab] register failed', error); } catch {}
      return false;
    }
  }

  register();
  W.addEventListener(EV_CHUB_READY_V1, register, true);

  if (!LAST_API) {
    let tries = 0;
    const timer = W.setInterval(() => {
      tries += 1;
      if (register() || tries > 80) {
        try { W.clearInterval(timer); } catch {}
      }
    }, 250);
  }
})();
