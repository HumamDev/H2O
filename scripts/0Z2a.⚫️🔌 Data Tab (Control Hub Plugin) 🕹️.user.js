// ==UserScript==
// @h2o-id      0z2.data.tab.control.hub.plugin
// @name         0Z2.⚫️🔌 Data Tab (Control Hub Plugin) 🕹️
// @namespace    H2O.ChatGPT.ControlHub
// @version      1.0.10
// @description  Adds the Data tab (Archive / Backup / WebDAV / Vault) to H2O Control Hub via plugin registry.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const TOK = 'CH';
  const PID = 'cntrlhb';

  let LAST_API = null;

  // These names are expected by the transplanted Data-tab code (kept inside this closure).
  let SkID = '';
  let CLS  = '';
  let ATTR_CGXUI = 'data-cgxui';
  let ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CHUB_ART = 'data-h2o-chub-artifact';
  let SEL_CHUB_BODY = '';

function getApi(){
  // ✅ Find Control Hub host API robustly (split-safe across naming changes).
  try {
    const H2O = (TOPW.H2O || W.H2O);
    if (!H2O) return null;

    const isHubApi = (api) =>
      api &&
      (typeof api.registerPlugin === 'function' || typeof api.registerTab === 'function');

    // Common known paths (fast)
    const fast = [
      // Newer Control Hub builds (PID=cnhb)
      H2O?.CH?.cnhb,
      H2O?.CHUB?.cnhb,
      H2O?.CGX?.cnhb,
      // Older Control Hub builds (PID=cntrlhb)
      H2O?.CH?.cntrlhb,
      H2O?.CHUB?.cntrlhb,
      H2O?.CHUB?.chub,
      H2O?.CGX?.cntrlhb,
      H2O?.CGX?.chub,
    ];

    for (const node of fast) {
      const api = node?.api;
      if (isHubApi(api)) return api;
    }

    // Shallow scan (bounded)
    for (const tok of Object.keys(H2O)) {
      const bucket = H2O[tok];
      if (!bucket || typeof bucket !== 'object') continue;

      for (const pid of Object.keys(bucket)) {
        const api = bucket?.[pid]?.api;
        if (isHubApi(api)) return api;
      }
    }
  } catch {}
  return null;
}

  // 🔧 Back-compat alias (older call sites used DATA_getApi)
  function DATA_getApi(){
    // ✅ Resolve H2O Data sync API (push/pull + vault + livesync)
    // Do not depend on Control Hub internals (they may not be ready).
    try {
      const H2O = (TOPW.H2O || W.H2O);
      return H2O?.sync || H2O?.data?.sync || null;
    } catch {}
    return null;
  }


  function SAFE_call(label, fn){
    try { return fn(); } catch (e) { console.warn('[H2O DataTab] ' + label, e); }
  }

  function UTIL_q(sel, root){
    const r = root || D;
    return r.querySelector(sel);
  }

  function UTIL_qAll(sel, root){
    const r = root || D;
    return Array.from(r.querySelectorAll(sel));
  }


  function DATA_scrollBodyTop(panel){
    try{
      const body = UTIL_q(SEL_CHUB_BODY, panel) || panel;
      if (!body) return;
      // smooth when possible
      if (typeof body.scrollTo === 'function') body.scrollTo({ top: 0, behavior: 'smooth' });
      else body.scrollTop = 0;
    } catch {}
  }

  function DATA_cssText(skin){
    const P = skin?.panelSel || '';
    const CLS = skin?.CLS || '';
    const ATTR_CGXUI = skin?.ATTR_CGXUI || 'data-cgxui';
    const ATTR_CGXUI_OWNER = skin?.ATTR_CGXUI_OWNER || 'data-cgxui-owner';
    const SkID = skin?.SkID || '';

    return `
${P} .${CLS}-data-summary{margin-top:10px; padding:10px 14px; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); font-size:12px; line-height:1.4}
${P} .${CLS}-data-summary-line{opacity:.75}

/* ───────── ☁️ Sync: WebDAV Modal (liquid glass) ───────── */
.h2o-chub-modalbackdrop{
  position: fixed;
  inset: 0;
  z-index: 2147483690;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(0,0,0,.38);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
.h2o-chub-modalcard{
  width: min(520px, 94vw);
  border-radius: 18px;
  padding: 14px 14px 12px;
  background: rgba(10,12,18,.74);
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 18px 70px rgba(0,0,0,.55);
}
.h2o-chub-modaltitle{
  font-weight: 650;
  font-size: 14px;
  letter-spacing: .2px;
  margin: 2px 2px 4px;
  opacity: .96;
}
.h2o-chub-modalsub{
  font-size: 12px;
  opacity: .68;
  margin: 0 2px 10px;
  line-height: 1.35;
}
.h2o-chub-modalform{ display:flex; flex-direction:column; gap:10px; }
.h2o-chub-row{ display:flex; flex-direction:column; gap:6px; }
.h2o-chub-rowlab{ font-size: 12px; opacity: .72; }
.h2o-chub-inp{
  width: 100%;
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.10);
  color: inherit;
  outline: none;
}
.h2o-chub-inp:focus{
  border-color: rgba(255,255,255,.22);
  background: rgba(255,255,255,.075);
}
.h2o-chub-hint{
  font-size: 12px;
  opacity: .72;
  line-height: 1.35;
}
.h2o-chub-hint code{
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.10);
}
.h2o-chub-modalactions{
  display:flex;
  gap:10px;
  margin-top: 12px;
  justify-content: flex-end;
}
.h2o-chub-mbtn{
  border-radius: 999px;
  padding: 9px 12px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.06);
  color: inherit;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
}
.h2o-chub-mbtn:hover{ background: rgba(255,255,255,.085); }
.h2o-chub-mbtn.is-ghost{
  background: rgba(0,0,0,.10);
}
.h2o-chub-mbtn.is-primary{
  border: 1px solid rgba(255,255,255,.16);
  background: linear-gradient(180deg, rgba(255,204,120,.95), rgba(255,149,0,.92));
  color: rgba(20,18,10,.92);
}
.h2o-chub-mbtn.is-primary:hover{
  filter: brightness(1.03);
}

/* ───────── Sync inline WebDAV box ───────── */
.h2o-chub-syncbox{
  margin-top: 10px;
  padding: 10px 10px 12px;
  border-radius: 14px;
  background: rgba(10, 14, 22, 0.55);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(10px);
}

.h2o-chub-syncbox{
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 10px 30px rgba(0,0,0,.22);
  backdrop-filter: blur(16px) saturate(1.2);
}
.h2o-chub-syncbox-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:10px;
}
.h2o-chub-syncbox-head .badge{
  font-size:11px;
  padding:4px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.75);
}
.h2o-chub-syncbox form{ display:flex; flex-direction:column; gap:10px; }
.h2o-chub-syncbox .h2o-chub-input{
  width:100%;
  box-sizing:border-box;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:rgba(255,255,255,.92);
  outline:none;
  font-size:13px;
  line-height:1.2;
}
.h2o-chub-syncbox .h2o-chub-input::placeholder{ color:rgba(255,255,255,.35); }
.h2o-chub-syncbox .h2o-chub-input:focus{
  border-color: rgba(120,200,255,.35);
  background: rgba(255,255,255,.08);
  box-shadow: 0 0 0 3px rgba(90,170,255,.18);
}
.h2o-chub-syncbox-grid2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
.h2o-chub-syncbox-actions{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
.h2o-chub-syncbox-help{ font-size:11px; line-height:1.35; color: rgba(255,255,255,.62); margin-top:4px; }
.h2o-chub-syncbox-check{ display:flex; align-items:center; gap:8px; margin-top:2px; }
.h2o-chub-syncbox-check input{ transform: translateY(1px); }
.h2o-chub-syncbox-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:8px;
}
.h2o-chub-syncbox-status{
  font-size:12px;
  opacity:.85;
}
.h2o-chub-syncbox-form{
  display:grid;
  grid-template-columns: 1fr;
  gap:8px;
}
.h2o-chub-syncbox-remember{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  opacity:.85;
  user-select:none;
}
.h2o-chub-syncbox-actions{
  display:flex;
  gap:8px;
  margin-top:10px;
}
.h2o-chub-syncbox-note{
  margin-top:8px;
  font-size:11px;
  opacity:.65;
  line-height:1.25;
}
.h2o-chub-btn.is-compact{
  padding: 7px 10px;
  border-radius: 12px;
  min-height: 30px;
}


/* ───────── Sync / WebDAV credential card ───────── */
.h2o-ch-sync-webdav{
  margin-top: 12px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(0,0,0,.18);
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 10px 30px rgba(0,0,0,.22);
}
.h2o-ch-sync-webdav-h{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.h2o-ch-sync-webdav-title{
  font-weight: 800;
  letter-spacing: .2px;
}
.h2o-ch-sync-webdav-sub{
  font-size: 12px;
  opacity: .72;
}
.h2o-ch-sync-webdav-sub.ok{ opacity: .9; }
.h2o-ch-sync-webdav-card{
  padding: 10px;
  border-radius: 14px;
  background: rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.10);
}
.h2o-ch-sync-webdav-row{
  display:grid;
  grid-template-columns: 1fr 120px;
  gap: 10px;
  margin-bottom: 10px;
}
.h2o-ch-sync-webdav-row .h2o-ch-sync-webdav-field:nth-child(3){
  grid-column: 1 / -1;
}
.h2o-ch-sync-webdav-field{
  display:flex;
  flex-direction:column;
  gap: 6px;
}
.h2o-ch-sync-webdav-lab{
  font-size: 12px;
  opacity: .75;
}
.h2o-ch-sync-webdav-inp{
  width:100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(0,0,0,.35);
  color: rgba(255,255,255,.92);
  outline: none;
}
.h2o-ch-sync-webdav-inp::placeholder{
  color: rgba(255,255,255,.42);
}
.h2o-ch-sync-webdav-passTools{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
  margin: 2px 0 8px;
}
.h2o-ch-sync-webdav-remember{
  display:flex;
  align-items:center;
  gap: 8px;
  font-size: 12px;
  opacity: .85;
  user-select:none;
}
.h2o-ch-sync-webdav-preview,
.h2o-ch-sync-webdav-status{
  padding: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.10);
  margin-top: 10px;
}
.h2o-ch-sync-webdav-previewTitle,
.h2o-ch-sync-webdav-statusTitle{
  font-size: 12px;
  opacity: .75;
  margin-bottom: 6px;
}
.h2o-ch-sync-webdav-previewBody,
.h2o-ch-sync-webdav-statusBody{
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.35;
  opacity: .95;
}
.h2o-ch-sync-webdav-actions{
  display:flex;
  gap: 10px;
  justify-content:flex-end;
  margin-top: 10px;
}
.h2o-ch-btn.h2o-ch-btn-chip{
  border-radius: 999px;
  padding: 8px 12px;
  min-height: 34px;
}
.h2o-ch-btn.h2o-ch-btn-primary{
  border-radius: 999px;
  padding: 8px 14px;
  min-height: 34px;
}
.h2o-ch-btn.h2o-ch-btn-warn{
  border-radius: 999px;
  padding: 8px 14px;
  min-height: 34px;
}
.h2o-ch-btn.h2o-ch-btn-ghost{
  border-radius: 999px;
  padding: 8px 12px;
  min-height: 34px;
  background: rgba(255,255,255,.08);
}



/* ───────────────────────────── ☁️ WebDAV Modal (Data tab) ───────────────────────────── */
[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"]{
  position: fixed;
  inset: 0;
  z-index: 2147483690;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-card{
  width: min(720px, calc(100vw - 28px));
  border-radius: 16px;
  background: rgba(20,20,24,.92);
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 24px 80px rgba(0,0,0,.55);
  padding: 14px 14px 12px;
  color: rgba(255,255,255,.92);
  position: relative;
  z-index: 1;
  pointer-events: auto;
  touch-action: manipulation;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  padding: 2px 2px 10px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-title{
  font-weight: 750;
  font-size: 16px;
  letter-spacing: .2px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-x{
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.92);
  cursor: pointer;
  pointer-events: auto;
  touch-action: manipulation;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-grid{
  display:grid;
  grid-template-columns: 1fr 120px;
  gap: 10px 10px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-span2{ grid-column: 1 / span 2; }

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-lbl{
  font-size: 12px;
  opacity: .78;
  margin: 0 0 6px 2px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-in{
  width: 100%;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.92);
  padding: 0 12px;
  outline: none;
  pointer-events: auto;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-in::placeholder{
  color: rgba(255,255,255,.35);
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-passrow{
  display:flex;
  gap: 8px;
  align-items:center;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-eye{
  width: 44px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.92);
  cursor:pointer;
  pointer-events: auto;
  touch-action: manipulation;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  padding: 10px 2px 6px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-check{
  display:flex; gap: 10px; align-items:center;
  font-size: 13px;
  opacity: .9;
  user-select:none;
  pointer-events: auto;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-chip{
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  font-size: 12px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-box{
  margin-top: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(0,0,0,.22);
  padding: 10px 12px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-boxlbl{
  font-size: 12px;
  opacity: .72;
  margin-bottom: 6px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-mono{
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  white-space: pre-wrap;
  opacity: .92;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-actions{
  display:flex;
  justify-content:flex-end;
  gap: 10px;
  padding: 12px 2px 4px;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-btn{
  height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.92);
  cursor:pointer;
  pointer-events: auto;
  touch-action: manipulation;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-primary{
  background: color-mix(in srgb, var(--primary-color, #f4b13a) 42%, rgba(255,255,255,.10));
  border-color: rgba(255,255,255,.18);
  color: rgba(10,10,12,.92);
  font-weight: 700;
}

[${ATTR_CGXUI}="modal-webdav"][${ATTR_CGXUI_OWNER}="${SkID}"] .h2o-wd-foot{
  margin-top: 6px;
  font-size: 12px;
  opacity: .65;
  padding: 0 2px 2px;
}


/* ───────────────────────────── ☁️ WebDAV Status Pill ───────────────────────────── */
.h2o-sync-pill{
  margin-top: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(0,0,0,.22);
  padding: 10px 12px;
}
.h2o-sync-pill-row{
  display:flex;
  justify-content:space-between;
  gap: 10px;
  align-items:center;
}
.h2o-sync-pill-title{
  font-weight: 750;
  font-size: 14px;
}
.h2o-sync-pill-right{
  font-size: 12px;
  opacity: .85;
}
.h2o-sync-pill-sub{
  margin-top: 6px;
  font-size: 12px;
  opacity: .7;
  overflow:hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


/* ========================= Data SubTabs ========================= */
.${CLS}-data-subtabs{
  display:flex;
  gap:6px;
  align-items:center;
  flex-wrap:nowrap;
  overflow:auto hidden;
  padding:8px 0 2px 0;
  margin:4px 0 0 0;
}
.${CLS}-data-subtabs::-webkit-scrollbar{ height:6px; }
.${CLS}-data-subtabs::-webkit-scrollbar-thumb{ border-radius:10px; background: color-mix(in srgb, var(--cgxui-fg, #fff) 18%, transparent); }

.${CLS}-data-subtab{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:6px 10px;
  border-radius:10px;
  border:1px solid color-mix(in srgb, var(--cgxui-fg, #fff) 14%, transparent);
  background: color-mix(in srgb, var(--cgxui-bg, #111) 86%, transparent);
  color: inherit;
  cursor:pointer;
  user-select:none;
  white-space:nowrap;
  font-size:12px;
  line-height:1;
  opacity:0.9;
  transition: opacity .12s ease, transform .12s ease, background .12s ease, border-color .12s ease;
}
.${CLS}-data-subtab:hover{
  opacity:1;
  transform: translateY(-0.5px);
  border-color: color-mix(in srgb, var(--cgxui-fg, #fff) 24%, transparent);
}
.${CLS}-data-subtab[aria-pressed="true"]{
  opacity:1;
  background: color-mix(in srgb, var(--cgxui-accent, #7aa2f7) 18%, var(--cgxui-bg, #111));
  border-color: color-mix(in srgb, var(--cgxui-accent, #7aa2f7) 38%, transparent);
}
.${CLS}-data-subtab-letter{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:18px;
  height:18px;
  border-radius:6px;
  font-weight:700;
  font-size:12px;
  background: color-mix(in srgb, var(--cgxui-fg, #fff) 10%, transparent);
}
.${CLS}-data-subtab-title{
  opacity:0.92;
}
/* =============================================================== */

`;
  }

function boot(api){
  if (!api) return false;

  // ✅ accept either contract; we only need registerPlugin for this file
  if (typeof api.registerPlugin !== 'function') return false;

    let skin = null;
    try {
      skin = (typeof api.getSkin === 'function') ? api.getSkin() : null;
    } catch (e) {
      console.warn('[H2O DataTab] getSkin failed (hub bug or partial boot). Will retry.', e);
      skin = null;
    }

    // Fallback (should rarely be needed): assumes default Control Hub identity.
    if (!skin || !skin.SkID) {
      skin = {
        SkID: 'cnhb',
        CLS: 'cgxui-cnhb',
        ATTR_CGXUI: 'data-cgxui',
        ATTR_CGXUI_OWNER: 'data-cgxui-owner',
        panelSel: '[data-cgxui="cnhb-panel"][data-cgxui-owner="cnhb"]',
        bodySel: '.cgxui-cnhb-body',
      };
    }

    // Bind hub tokens for this session (visible to the transplanted functions below).
    SkID = skin.SkID;
    CLS  = skin.CLS;
    ATTR_CGXUI = skin.ATTR_CGXUI;
    ATTR_CGXUI_OWNER = skin.ATTR_CGXUI_OWNER;
    SEL_CHUB_BODY = skin.bodySel || `.${CLS}-body`;


    // -------------------- Data SubTabs (internal) --------------------
    const DATA_SUBTAB_KEY = 'h2o:prm:cgx:cntrlhb:data:subtab:v1';
    const DATA_SUBTABS = [
      { id:'A', label:'A', title:'Archive' },
      { id:'B', label:'B', title:'Backup' },
      { id:'C', label:'C', title:'Vault' },
      { id:'D', label:'D', title:'Sync' },
    ];

    function DATA_getSubtab(){
      try {
        const v = (typeof H2O?.store?.getRaw === 'function') ? H2O.store.getRaw(DATA_SUBTAB_KEY) : null;
        if (v && typeof v === 'string') {
          const t = v.trim();
          if (t === 'A' || t === 'B' || t === 'C' || t === 'D') return t;
        }
      } catch {}
      try {
        const v2 = W.localStorage ? W.localStorage.getItem(DATA_SUBTAB_KEY) : null;
        if (v2 && typeof v2 === 'string') {
          const t2 = v2.trim();
          if (t2 === 'A' || t2 === 'B' || t2 === 'C' || t2 === 'D') return t2;
        }
      } catch {}
      return 'D'; // default: Sync first
    }

    function DATA_setSubtab(v){
      const next = (v === 'A' || v === 'B' || v === 'C' || v === 'D') ? v : 'D';
      try {
        if (typeof H2O?.store?.setRaw === 'function') H2O.store.setRaw(DATA_SUBTAB_KEY, next);
        else if (W.localStorage) W.localStorage.setItem(DATA_SUBTAB_KEY, next);
      } catch {}
    }

    function DATA_mountSubtabs(panel){
      if (!panel) return;
      const body = UTIL_q(SEL_CHUB_BODY, panel);
      if (!body) return;

      let bar = UTIL_q(`.${CLS}-data-subtabs`, panel);
      if (!bar) {
        bar = D.createElement('div');
        bar.className = `${CLS}-data-subtabs`;
        // insert at end of body (above controls, since controls are after body)
        body.appendChild(bar);
      }

      // rebuild buttons each render (cheap + avoids stale handlers)
      bar.textContent = '';
      const active = DATA_getSubtab();

      for (const t of DATA_SUBTABS){
        const b = D.createElement('button');
        b.type = 'button';
        b.className = `${CLS}-data-subtab`;
        b.setAttribute('data-subtab', t.id);
        b.setAttribute('aria-pressed', t.id === active ? 'true' : 'false');
        b.title = `${t.label}) ${t.title}`;

        const a = D.createElement('span');
        a.className = `${CLS}-data-subtab-letter`;
        a.textContent = t.label;

        const s = D.createElement('span');
        s.className = `${CLS}-data-subtab-title`;
        s.textContent = t.title;

        b.append(a, s);

        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          DATA_setSubtab(t.id);
          if (typeof LAST_API?.invalidate === 'function') LAST_API.invalidate();
          else if (typeof api?.invalidate === 'function') api.invalidate();
        }, true);

        bar.appendChild(b);
      }
    }

    function DATA_getControlsFiltered(all){
      const active = DATA_getSubtab();
      const prefix = `(${active})`;
      // show only the selected group (A/B/C/D)
      return all.filter(def => {
        const g = def?.group || '';
        return typeof g === 'string' && g.startsWith(prefix);
      });
    }
    // ----------------------------------------------------------------

    const DATA_CONTROLS = [
      {
        type:'action',
        key:'dataSync',
        group:'(D) Sync (WebDAV / Manual + LiveSync)',
        label:'Sync ☁️',
        help:'Off-device safety. Manual = copy/paste JSON. WebDAV = remote PUT/GET (app password). LiveSync = near-realtime auto push/pull.',
        render: ({ panel }) => DATA_renderSyncOverview(panel),
        buttons:[
          { label:'Use Manual (copy/paste)', primary:false, action: DATA_setSyncTargetManualAction },
          { label:'WebDAV Portal…', primary:false, action: DATA_setSyncTargetWebDAVAction },
        { label:'Sync Monitor…', primary:false, action: DATA_openSyncMonitorAction },
          { label:'Sync — Push (Backup)', primary:true, action: DATA_syncPushBackupAction },
          { label:'Sync — Pull (Backup)', primary:false, action: DATA_syncPullBackupAction },
          { label:'Sync — Push (Vault)', primary:false, action: DATA_syncPushVaultAction },
          { label:'Sync — Pull (Vault)', primary:false, action: DATA_syncPullVaultAction },
        ],
      },
      {
        type:'action',
        key:'dataArchiveCapture',
        group:'(A) Snapshot / Archive',
        label:'Archive — Capture 🗃️',
        help:'Capture what is on screen now and save it as “Archive Latest” for this chat.',
        buttons:[
          { label:'Archive — Capture', primary:true, statusLoading:'Capturing…', action: DATA_captureArchiveAction },
        ],
      },
      {
        type:'action',
        key:'dataArchiveExport',
        group:'(A) Snapshot / Archive',
        label:'Export — Archive Latest 📤',
        help:'Export from Archive Latest (what you captured). For live/selection export, use Export Chat.',
        buttons:[
          { label:'Markdown', action: () => DATA_exportLatestArchive('markdown') },
          { label:'HTML', action: () => DATA_exportLatestArchive('html') },
          { label:'PDF', action: () => DATA_exportLatestArchive2('pdf') },
          { label:'DOCX', action: () => DATA_exportLatestArchive2('docx') },
          { label:'DOC (legacy)', action: () => DATA_exportLatestArchive2('doc') },
          { label:'JSON', action: () => DATA_exportLatestArchive('json') },
        ],
      },
      {
        type:'action',
        key:'dataExportChat',
        group:'(A) Snapshot / Archive',
        label:'Export Chat (shortcut) 📀',
        help:'Shortcut to open the dedicated Export Chat tool (exports the current live chat or selected messages).',
        buttons:[
          { label:'Open Export Chat', primary:true, action: DATA_openExportChatAction },
        ],
      },
      {
        type:'action',
        key:'dataBackupExport',
        group:'(B) Backups (local JSON)',
        label:'Backup — Create (JSON) 🧯',
        help:'Create a portable JSON bundle of your H2O localStorage keys (restore later).',
        buttons:[
          { label:'Backup — Create (JSON)', primary:true, statusLoading:'Creating…', action: DATA_downloadBackupAction },
        ],
      },
      {
        type:'action',
        key:'dataBackupRestore',
        group:'(B) Backups (local JSON)',
        label:'Backup — Restore 🧯',
        help:'Restore a backup JSON into localStorage. “Merge” skips conflicts; “Overwrite” replaces conflicts.',
        buttons:[
          { label:'Restore (Merge)', primary:true, statusLoading:'Restoring…', action: () => DATA_restoreBackupAction('merge') },
          { label:'Restore (Overwrite)', primary:false, statusLoading:'Restoring…', action: () => DATA_restoreBackupAction('overwrite') },
        ],
      },
      {
        type:'action',
        key:'dataVault',
        group:'(C) Vault (versions)',
        label:'Vault 🧱',
        help:'Vault = versioned, labeled checkpoints (kept even if Archive Latest changes).',
        buttons:[
          { label:'Vault — Save Version', primary:true, statusLoading:'Saving…', action: DATA_vaultSaveFromArchiveLatest },
          { label:'Vault — List', primary:false, action: DATA_vaultList },
        ],
      },
    ];

    api.registerPlugin({
      key: 'data',
      title: 'Data',
      cssText: DATA_cssText,
      getControls: () => DATA_getControlsFiltered(DATA_CONTROLS),
      detailHook: ({ panel }) => SAFE_call('detailHook', () => { DATA_scrollBodyTop(panel); DATA_mountSubtabs(panel); DATA_renderSummary(panel); }),
      afterAction: ({ panel }) => SAFE_call('afterAction', () => { DATA_mountSubtabs(panel); DATA_renderSummary(panel); }),
    });

    if (typeof api.invalidate === 'function') api.invalidate();
    return true;
  }

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';

  function tick(){
    const api = getApi();
    if (!api) return;
    if (api === LAST_API) return;

    let ok = false;
    try { ok = boot(api); }
    catch (e) { console.warn('[H2O DataTab] boot crashed (will retry).', e); ok = false; }

    if (ok) LAST_API = api;
  }

  // Try immediately + react fast on hub boots
  tick();
  W.addEventListener(EV_CHUB_READY_V1, tick, true);

  // Safety net for hot reload / delayed boots
  setInterval(tick, 900);

  /* ============================ DATA TAB (transplanted) ============================ */
  const DATA_ARCHIVE_EXPORTS = {
    json: { method:'downloadJSON',   ext:'json', label:'JSON' },
    markdown: { method:'downloadMarkdown', ext:'md',  label:'Markdown' },
    html: { method:'downloadHTML',   ext:'html', label:'HTML' },
  };

  function DATA_formatDate(value){
    if (!value) return 'unknown time';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString('en-US');
  }

  function DATA_getSummaryLines(){
    const lines = [];
    try {
      const keys = (typeof H2O.store?.listMineKeys === 'function') ? H2O.store.listMineKeys() : null;
      if (Array.isArray(keys)) lines.push(`${keys.length} H2O key${keys.length === 1 ? '' : 's'} tracked.`);
    } catch {}
    try {
      const archiveIndex = (typeof H2O.archive?.list === 'function') ? H2O.archive.list() : null;
      if (Array.isArray(archiveIndex) && archiveIndex.length) lines.push(`Archive index: ${archiveIndex.length} saved chat${archiveIndex.length === 1 ? '' : 's'}.`);
    } catch {}
    try {
      const latest = (typeof H2O.archive?.getLatest === 'function') ? H2O.archive.getLatest() : null;
      if (latest && typeof latest === 'object') {
        const when = DATA_formatDate(latest.capturedAt);
        const count = Array.isArray(latest.messages) ? latest.messages.length : 0;
        lines.push(`Latest archive (${when}) · ${count} message${count === 1 ? '' : 's'}.`);
      }
    } catch {}
    try {
      const v = (typeof H2O.vault?.list === 'function') ? H2O.vault.list() : null;
      if (Array.isArray(v) && v.length) lines.push(`Vault: ${v.length} version${v.length === 1 ? '' : 's'} (current chat).`);
    } catch {}
    return lines;
  }

  function DATA_renderSummary(panel){
    if (!panel) return;
    const existing = UTIL_q(`.${CLS}-data-summary`, panel);
    if (existing) {
      try { existing.remove(); } catch {}
    }
    const lines = DATA_getSummaryLines();
    if (!lines.length) return;
    const container = D.createElement('div');
    container.className = `${CLS}-data-summary`;
    for (const line of lines) {
      const row = D.createElement('div');
      row.className = `${CLS}-data-summary-line`;
      row.textContent = line;
      container.appendChild(row);
    }
    const body = UTIL_q(SEL_CHUB_BODY, panel);
    if (body) body.insertAdjacentElement('afterend', container);
    else panel.appendChild(container);
  }

  function DATA_parseActionMessage(result, fallback){
    if (typeof result === 'string') return result;
    if (result && typeof result.message === 'string') return result.message;
    if (result && typeof result.msg === 'string') return result.msg;
    if (result && result.ok === false) return result.error || fallback || 'Action failed';
    return fallback || '';
  }

  function DATA_captureArchiveAction(){
    const archive = H2O.archive;
    if (!archive || typeof archive.captureLive !== 'function') {
      return { message: 'Archive module not ready yet.' };
    }
    const snapshot = archive.captureLive();
    if (!snapshot) return { message: 'No chat content found to archive.' };
    const saved = archive.saveLatest?.(snapshot);
    const count = Array.isArray(snapshot.messages) ? snapshot.messages.length : 0;
    return {
      ok: !!saved,
      message: saved ? `Captured ${count} message${count === 1 ? '' : 's'}.` : 'Snapshot created but save failed.',
    };
  }

  function DATA_downloadBackupAction(){
    const backup = H2O.backup;
    if (!backup || typeof backup.exportBundle !== 'function' || typeof backup.downloadBundle !== 'function') {
      return { message: 'Backup module not loaded yet.' };
    }
    const bundle = backup.exportBundle();
    if (!bundle || !Array.isArray(bundle.items)) {
      return { message: 'No backup data available.' };
    }
    backup.downloadBundle(bundle, `H2O_backup_${Date.now()}.json`);
    const count = bundle.count ?? bundle.items.length;
    return { ok: true, message: `Exported ${count} entr${count === 1 ? 'y' : 'ies'}.` };
  }

  function DATA_pickJSONFile(){
    return new Promise((resolve) => {
      const inp = D.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.style.display = 'none';
      D.body.appendChild(inp);

      const cleanup = () => {
        try { inp.remove(); } catch {}
      };

      inp.addEventListener('change', () => {
        const file = inp.files && inp.files[0];
        if (!file) { cleanup(); resolve(null); return; }
        const r = new FileReader();
        r.onload = () => { cleanup(); resolve(String(r.result || '')); };
        r.onerror = () => { cleanup(); resolve(null); };
        r.readAsText(file);
      }, { once: true });

      inp.click();
    });
  }

  async function DATA_restoreBackupAction(mode){
    const backup = H2O.backup;
    if (!backup || typeof backup.importBundle !== 'function') {
      return { message: 'Backup module not loaded yet.' };
    }
    const raw = await DATA_pickJSONFile();
    if (!raw) return { message: 'No file selected.' };

    let bundle = null;
    try { bundle = JSON.parse(raw); } catch { return { message: 'Invalid JSON.' }; }

    const report = backup.importBundle(bundle, { mode: mode === 'overwrite' ? 'overwrite' : 'merge' });
    const a = report?.applied?.length || 0;
    const s = report?.skipped?.length || 0;
    const f = report?.failed?.length || 0;
    return { ok: true, message: `Restored: ${a} applied · ${s} skipped · ${f} failed.` };
  }

  function DATA_openExportChatAction(){
    // Export Chat script uses SkID = 'xpch'
    const btn = D.getElementById('cgxui-xpch-export-btn');
    if (!btn) return { message: 'Export Chat button not found (is Export Chat script enabled?).' };
    try { btn.click(); } catch {}
    return { ok: true, message: 'Opened Export Chat.' };
  }

  function DATA_exportLatestArchive2(kind){
    const archive = H2O.archive;
    if (!archive || typeof archive.getLatest !== 'function') return { message: 'Archive module not ready yet.' };
    const snapshot = archive.getLatest();
    if (!snapshot) return { message: 'No saved archive yet.' };
    const exporter = H2O.export;
    if (!exporter) return { message: 'Exporter unavailable.' };

    const chatId = snapshot.chatId || 'unknown';
    const title = `Chat ${chatId}`;

    if (kind === 'pdf') {
      if (typeof exporter.downloadPDF !== 'function') return { message: 'PDF exporter unavailable.' };
      exporter.downloadPDF(snapshot, `H2O_archive_${chatId}.pdf`, title);
      return { ok: true, message: 'Exported Archive Latest to PDF (via print dialog).' };
    }
    if (kind === 'docx') {
      if (typeof exporter.downloadDOCXReal === 'function') {
        exporter.downloadDOCXReal(snapshot, `H2O_archive_${chatId}.docx`, title);
        return { ok: true, message: 'Exported Archive Latest to DOCX (real).' };
      }
      if (typeof exporter.downloadDOC === 'function') {
        exporter.downloadDOC(snapshot, `H2O_archive_${chatId}.doc`, title);
        return { ok: true, message: 'DOCX exporter missing → exported DOC (legacy) instead.' };
      }
      return { message: 'DOCX exporter unavailable.' };
    }

    if (kind === 'doc') {
      if (typeof exporter.downloadDOC !== 'function') return { message: 'DOC exporter unavailable.' };
      exporter.downloadDOC(snapshot, `H2O_archive_${chatId}.doc`, title);
      return { ok: true, message: 'Exported Archive Latest to DOC (Word-openable HTML).' };
    }

    return DATA_exportLatestArchive(kind);
  }

  function DATA_vaultSaveFromArchiveLatest(){
    const v = H2O.vault;
    if (!v || typeof v.saveFromArchiveLatest !== 'function') return { message: 'Vault not available (update H2O Data core).' };
    const label = prompt('Vault label (optional):', '');
    const res = v.saveFromArchiveLatest({ label: String(label || '').trim() });
    if (!res?.ok) return { message: `Vault save failed (${res?.reason || 'unknown'}).` };
    return { ok: true, message: `Vault saved: ${res.vid}${res?.entry?.label ? ` — ${res.entry.label}` : ''}` };
  }

  function DATA_vaultList(){
    const v = H2O.vault;
    if (!v || typeof v.list !== 'function') return { message: 'Vault not available.' };
    const items = v.list() || [];
    if (!items.length) return { message: 'Vault is empty (current chat).' };
    // Show a minimal readable list without clutter.
    const top = items.slice(0, 10).map(e => `${e.vid}${e.label ? ` — ${e.label}` : ''} (${DATA_formatDate(e.savedAt)})`).join('\n');
    alert(`Vault (latest 10)\n\n${top}`);
    return { ok: true, message: `Vault: ${items.length} version${items.length === 1 ? '' : 's'}.` };
  }

  function DATA_exportLatestArchive(format){
    const entry = DATA_ARCHIVE_EXPORTS[String(format || '').toLowerCase()];
    if (!entry) return { message: 'Unsupported archive format.' };
    const archive = H2O.archive;
    if (!archive || typeof archive.getLatest !== 'function') {
      return { message: 'Archive module not ready yet.' };
    }
    const snapshot = archive.getLatest();
    if (!snapshot) return { message: 'No saved archive yet.' };
    const exporter = H2O.export;
    if (!exporter || typeof exporter[entry.method] !== 'function') {
      return { message: `${entry.label} exporter unavailable.` };
    }
    const chatId = snapshot.chatId || 'unknown';
    const filename = `H2O_archive_${chatId}.${entry.ext}`;
    const args = [snapshot, filename];
    if (entry.ext === 'md' || entry.ext === 'html') args.push(`Chat ${chatId}`);
    exporter[entry.method](...args);
    return { ok: true, message: `Downloaded latest archive as ${entry.label}.` };
  }


/* ───────────────────────────── 🟦 Data: Sync (Manual + WebDAV) ───────────────────────────── */

function DATA_getSyncApi() {
  return H2O?.sync || null;
}

// ───────────────────────────── 📊 Report formatting ─────────────────────────────
function DATA_normCount(v) { return Array.isArray(v) ? v.length : (Number.isFinite(v) ? v : (parseInt(v, 10) || 0)); }
function DATA_normList(v) { return Array.isArray(v) ? v : []; }
function DATA_fmtReport(rep) {
  rep = rep || {};
  const appliedL = DATA_normList(rep.applied);
  const skippedL = DATA_normList(rep.skipped);
  const failedL  = DATA_normList(rep.failed);

  const appliedN = (appliedL.length ? appliedL.length : DATA_normCount(rep.applied));
  const skippedN = (skippedL.length ? skippedL.length : DATA_normCount(rep.skipped));
  const failedN  = (failedL.length  ? failedL.length  : DATA_normCount(rep.failed));

  return { appliedN, skippedN, failedN, appliedL, skippedL, failedL };
}
function DATA_alertReport(title, rep) {
  const r = DATA_fmtReport(rep);
  let msg = `${title}\nApplied: ${r.appliedN}\nSkipped: ${r.skippedN}\nFailed: ${r.failedN}`;
  if (r.failedL.length) {
    const preview = r.failedL.slice(0, 10).join('\n• ');
    msg += `\n\nFailed keys (first ${Math.min(10, r.failedL.length)}):\n• ${preview}`;
    if (r.failedL.length > 10) msg += `\n• … (+${r.failedL.length - 10} more)`;
  }
  alert(msg);
  return r;
}


async function DATA_waitSyncApi(timeoutMs = 2500) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const api = DATA_getSyncApi();
    if (api) return api;
    await new Promise(r => setTimeout(r, 90));
  }
  return null;
}


function DATA_setSyncTargetManualAction() {
  SAFE_call('DATA_setSyncTargetManualAction', () => {
    // Manual mode = local copy/paste only (no remote target)
    const api = DATA_getSyncApi()?.webdav || null;
    try { api?.clearCreds?.(); } catch {}
    try { CORE_CH_renderActiveTab?.(); } catch {}
  });
}

function DATA_openSyncMonitorAction() {
  SAFE_call('DATA_openSyncMonitorAction', () => {
    const W = TOPW;
    const api =
      (W.H2O && W.H2O.sync) ||
      (W.H2O && W.H2O.HS && W.H2O.HS.h2osync) ||
      null;

    if (api && typeof api.openMonitor === 'function') return api.openMonitor();

    try { return DATA_setSyncTargetWebDAVAction(); } catch {}

    try { DATA_toast?.('Sync Monitor not available (load H2O Sync).', 'warn'); } catch {}
  });
}




function DATA_setSyncTargetWebDAVAction() {
  // Open WebDAV credentials modal (no auto-link, user must click Link/Test)
  SAFE_call('DATA_setSyncTargetWebDAVAction', () => {
    DATA_openWebDAVModal();
  });
}


async function DATA_needWebDavAuth(api) {
  const t = api?.getTarget?.() || {};
  if (t?.type !== 'webdav') return null;
  const user = String(t.user || '').trim();
  if (!user) return null;

  // Prefer stored creds if present
  const c = api?.getCreds?.();
  const savedPass = String(c?.pass || '').trim();
  if (savedPass) return { username: user, password: savedPass };

  // Fallback: ask once
  const pass = prompt('WebDAV password:');
  if (!pass) return null;
  return { username: user, password: pass };
}

function DATA_openTextModal(title, initialText, opts = {}) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483690;
    background: rgba(0,0,0,.35);
    display: flex; align-items: center; justify-content: center;
    padding: 18px;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    width: min(720px, 92vw);
    max-height: min(78vh, 720px);
    overflow: hidden;
    border-radius: 16px;
    background: rgba(15, 18, 28, .78);
    border: 1px solid rgba(255,255,255,.10);
    box-shadow: 0 20px 70px rgba(0,0,0,.55);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    display: flex; flex-direction: column;
  `;

  const head = document.createElement('div');
  head.style.cssText = `
    padding: 12px 14px;
    display:flex; align-items:center; justify-content:space-between;
    border-bottom: 1px solid rgba(255,255,255,.10);
    gap: 10px;
  `;
  const h = document.createElement('div');
  h.textContent = title || 'Sync';
  h.style.cssText = `font-weight:700; letter-spacing:.2px;`;
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = `
    border: 0; cursor:pointer;
    color: rgba(255,255,255,.85);
    background: rgba(255,255,255,.08);
    padding: 8px 10px; border-radius: 12px;
  `;
  head.append(h, close);

  const body = document.createElement('div');
  body.style.cssText = `padding: 12px 14px; display:flex; flex-direction:column; gap:10px;`;

  const ta = document.createElement('textarea');
  ta.value = String(initialText || '');
  ta.placeholder = opts.placeholder || '';
  ta.spellcheck = false;
  ta.style.cssText = `
    width: 100%;
    min-height: 260px;
    max-height: 52vh;
    resize: vertical;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(0,0,0,.25);
    color: rgba(255,255,255,.92);
    padding: 10px 12px;
    outline: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    line-height: 1.35;
  `;
  body.appendChild(ta);

  const foot = document.createElement('div');
  foot.style.cssText = `
    padding: 12px 14px;
    display:flex; gap: 10px; flex-wrap: wrap;
    justify-content: flex-end;
    border-top: 1px solid rgba(255,255,255,.10);
  `;

  const mkBtn = (label) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `
      cursor:pointer; border:0;
      padding: 10px 12px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(255,209,112,.95), rgba(255,156,74,.95));
      color: rgba(0,0,0,.85);
      font-weight: 700;
      box-shadow: 0 10px 24px rgba(0,0,0,.25);
      min-width: 120px;
    `;
    return b;
  };

  const btnCopy = mkBtn('Copy');
  btnCopy.style.minWidth = '96px';
  const btnApply = opts.onApply ? mkBtn(opts.applyLabel || 'Apply') : null;
  if (btnApply) btnApply.style.minWidth = '110px';
  const btnClose = mkBtn('Close');
  btnClose.style.minWidth = '96px';
  btnClose.style.background = 'rgba(255,255,255,.10)';
  btnClose.style.color = 'rgba(255,255,255,.92)';
  btnClose.style.boxShadow = 'none';

  foot.append(btnCopy);
  if (btnApply) foot.append(btnApply);
  foot.append(btnClose);

  function destroy() { try { overlay.remove(); } catch {} }

  close.onclick = destroy;
  btnClose.onclick = destroy;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });

  btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(ta.value || '');
      alert('Copied ✅');
    } catch {
      alert('Copy failed (browser blocked clipboard). Select + copy manually.');
    }
  };

  if (btnApply) {
    btnApply.onclick = async () => {
      const text = ta.value || '';
      const ok = await opts.onApply(text);
      if (ok !== false) destroy();
    };
  }

  card.append(head, body, foot);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // focus for quick paste
  setTimeout(() => { try { ta.focus(); } catch {} }, 0);

  return { overlay, card, textarea: ta, close: destroy };
}


  function DATA_renderWebDAVStatusPill(panel){
    // Ensure no duplicates (this function may be called on re-render)
    try{ panel.querySelectorAll('.h2o-sync-pill, .h2o-chub-syncbox-note').forEach(n => { try{ n.remove(); } catch{} }); }catch{}
    const api = DATA_getSyncApi()?.webdav || null;
    const snap = api?.getState?.();
    const st = snap?.state || {};
    const url = snap?.creds?.baseUrl || '';
    const folder = snap?.creds?.folder || 'H2O';

    const pill = document.createElement('div');
    pill.className = 'h2o-sync-pill';
    pill.setAttribute(ATTR_CHUB_ART,'1');
    const label = api ? 'WebDAV' : 'WebDAV (missing H2O Data)';
    const linked = st.linked ? 'Linked ✅' : 'Unlinked ⚪️';
    pill.innerHTML = `
      <div class="h2o-sync-pill-row">
        <div class="h2o-sync-pill-title">${label}</div>
        <div class="h2o-sync-pill-right">${linked}</div>
      </div>
      <div class="h2o-sync-pill-sub">${url ? (url + '/' + folder) : 'No URL set'}</div>
    `;
    panel.appendChild(pill);
  }


function DATA_renderSyncOverview(panel){
  // ✅ Minimal sync overview (no inline portal). Open the portal only via the button.
  try { DATA_renderWebDAVStatusPill(panel); } catch {}

  // 🔁 LiveSync toggle (near-instant sync via auto-push + polling pull)
  // Canonical surface: H2O.sync.live (H2O Data v1.1.0+). We also accept H2O.data.sync.live via compat.
  try {
    const live = window.H2O?.sync?.live || window.H2O?.data?.sync?.live || null;
    const wrap = document.createElement('div');
    wrap.className = 'h2o-chub-syncbox-note';
    wrap.setAttribute(ATTR_CHUB_ART,'1');
    wrap.style.cssText += 'display:flex; align-items:center; justify-content:space-between; gap:10px;';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex; flex-direction:column; gap:2px;';

    const title = document.createElement('div');
    title.textContent = 'LiveSync ⚡';
    title.style.cssText = 'font-weight:700;';

    const sub = document.createElement('div');
    sub.textContent = live ? 'Auto-push on change + auto-pull by polling (near realtime).' : 'Requires H2O Data (sync.live unavailable).';
    sub.style.cssText = 'opacity:.85; font-size:12px;';

    left.append(title, sub);

    const right = document.createElement('label');
    right.style.cssText = 'display:flex; align-items:center; gap:8px; user-select:none;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.disabled = !live;
    const badge = document.createElement('span');
    badge.textContent = 'OFF';
    badge.style.cssText = 'font-weight:800; font-size:12px; opacity:.9;';
    right.append(cb, badge);

    const readCfg = () => {
      try {
        const cfg = live?.getCfg?.() || {};
        cb.checked = !!cfg.enabled;
        badge.textContent = cfg.enabled ? `ON · ${Number(cfg.pollMs||2000)}ms` : 'OFF';
      } catch {
        cb.checked = false;
        badge.textContent = 'OFF';
      }
    };

    cb.onchange = () => {
      try {
        live?.setCfg?.({ enabled: !!cb.checked });
      } catch {}
      readCfg();
    };

    readCfg();

    // keep badge fresh if status events stream in
    const onStatus = (e) => {
      try {
        const d = e?.detail || {};
        if (d.kind === 'started' || d.kind === 'stopped' || String(d.kind||'').startsWith('poll:') || String(d.kind||'').startsWith('push:')) {
          readCfg();
        }
      } catch {}
    };
    try { window.top.addEventListener('evt:h2o:data:liveStatus', onStatus); } catch {}

    wrap.append(left, right);
    panel.appendChild(wrap);
  } catch {}

  const note = document.createElement('div');
  note.className = 'h2o-chub-syncbox-note';
    note.setAttribute(ATTR_CHUB_ART,'1');
  note.textContent = 'Open the WebDAV portal only when needed: click “WebDAV Portal…” below to configure / link / test.';
  panel.appendChild(note);
}



function DATA_renderWebDAVCredsInline(panel) {
  // Renders a compact “Cyberduck-like” credential card inside the Sync section.
  // Works even if H2O.Data isn't loaded yet: we still store the creds locally,
  // then when H2O.sync.webdav becomes available the buttons will activate.

  const api = window.H2O?.sync?.webdav || null;

  // Shared disk key (owned by Data domain, but safe for Control Hub to write/read)
  const KEY_CREDS = 'h2o:prm:cgx:h2odata:sync:webdav:creds:v1';
  const KEY_STATUS = 'h2o:prm:cgx:h2odata:sync:last:v1';

  const wrap = document.createElement('div');
  wrap.className = 'h2o-ch-sync-webdav';

  const header = document.createElement('div');
  header.className = 'h2o-ch-sync-webdav-h';
  header.innerHTML = `
    <div class="h2o-ch-sync-webdav-title">WebDAV</div>
    <div class="h2o-ch-sync-webdav-sub" data-ch-webdav-sub></div>
  `;
  wrap.appendChild(header);

  const card = document.createElement('div');
  card.className = 'h2o-ch-sync-webdav-card';
  wrap.appendChild(card);

  const row1 = document.createElement('div');
  row1.className = 'h2o-ch-sync-webdav-row';
  card.appendChild(row1);

  const mkField = (label, type = 'text', placeholder = '') => {
    const box = document.createElement('label');
    box.className = 'h2o-ch-sync-webdav-field';
    const lab = document.createElement('div');
    lab.className = 'h2o-ch-sync-webdav-lab';
    lab.textContent = label;
    const inp = document.createElement('input');
    inp.className = 'h2o-ch-sync-webdav-inp';
    inp.type = type;
    inp.placeholder = placeholder;
    box.appendChild(lab);
    box.appendChild(inp);
    return { box, inp };
  };

  // Fields: Server | Port | URL
  const fServer = mkField('Server', 'text', 'app.koofr.net');
  const fPort   = mkField('Port',   'text', '443');
  const fUrl    = mkField('URL',    'text', 'https://app.koofr.net/dav/Koofr');

  row1.appendChild(fServer.box);
  row1.appendChild(fPort.box);
  card.appendChild(fUrl.box);

  // Fields: Username | Password | Root folder
  const row2 = document.createElement('div');
  row2.className = 'h2o-ch-sync-webdav-row';
  card.appendChild(row2);

  const fUser = mkField('Username', 'text', 'email / login');
  const fPass = mkField('Password', 'password', 'app password');
  const fRoot = mkField('Folder',   'text', 'H2O');

  row2.appendChild(fUser.box);
  row2.appendChild(fPass.box);
  row2.appendChild(fRoot.box);

  // Password tools
  const passTools = document.createElement('div');
  passTools.className = 'h2o-ch-sync-webdav-passTools';

  const btnEye = document.createElement('button');
  btnEye.type = 'button';
  btnEye.className = 'h2o-ch-btn h2o-ch-btn-ghost';
  btnEye.textContent = 'Show';
  btnEye.onclick = () => {
    const isPw = fPass.inp.type === 'password';
    fPass.inp.type = isPw ? 'text' : 'password';
    btnEye.textContent = isPw ? 'Hide' : 'Show';
  };

  const rememberWrap = document.createElement('label');
  rememberWrap.className = 'h2o-ch-sync-webdav-remember';
  const remember = document.createElement('input');
  remember.type = 'checkbox';
  const rememberTxt = document.createElement('span');
  rememberTxt.textContent = 'Remember password on this device';
  rememberWrap.appendChild(remember);
  rememberWrap.appendChild(rememberTxt);

  passTools.appendChild(btnEye);
  passTools.appendChild(rememberWrap);
  card.appendChild(passTools);

  // Connection preview + status
  const preview = document.createElement('div');
  preview.className = 'h2o-ch-sync-webdav-preview';
  preview.innerHTML = `
    <div class="h2o-ch-sync-webdav-previewTitle">Connection preview</div>
    <div class="h2o-ch-sync-webdav-previewBody" data-ch-webdav-preview></div>
  `;
  card.appendChild(preview);

  const status = document.createElement('div');
  status.className = 'h2o-ch-sync-webdav-status';
  status.innerHTML = `
    <div class="h2o-ch-sync-webdav-statusTitle">Status</div>
    <div class="h2o-ch-sync-webdav-statusBody" data-ch-webdav-status></div>
  `;
  card.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'h2o-ch-sync-webdav-actions';
  card.appendChild(actions);

  const btnTest = document.createElement('button');
  btnTest.type = 'button';
  btnTest.className = 'h2o-ch-btn h2o-ch-btn-chip';
  btnTest.textContent = 'Test';

  const btnLink = document.createElement('button');
  btnLink.type = 'button';
  btnLink.className = 'h2o-ch-btn h2o-ch-btn-primary';
  btnLink.textContent = 'Link';

  const btnUnlink = document.createElement('button');
  btnUnlink.type = 'button';
  btnUnlink.className = 'h2o-ch-btn h2o-ch-btn-warn';
  btnUnlink.textContent = 'Unlink';

  actions.appendChild(btnTest);
  actions.appendChild(btnLink);
  actions.appendChild(btnUnlink);

  // Helper: read/write creds (safe)
  const loadCreds = () => {
    try {
      const raw = localStorage.getItem(KEY_CREDS);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };

  const saveCreds = (obj) => {
    try {
      localStorage.setItem(KEY_CREDS, JSON.stringify(obj));
      return true;
    } catch { return false; }
  };

  const clearCreds = () => {
    try { localStorage.removeItem(KEY_CREDS); } catch {}
  };

  const loadStatus = () => {
    try {
      const raw = localStorage.getItem(KEY_STATUS);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };

  const fmt = (v) => String(v ?? '').trim();

  const normalize = () => {
    // keep preview updated even before Link
    const server = fmt(fServer.inp.value);
    const port = fmt(fPort.inp.value) || '443';
    const baseUrl = fmt(fUrl.inp.value);
    const root = fmt(fRoot.inp.value || 'H2O') || 'H2O';

    const safeBase = baseUrl.replace(/\/+$/, '');
    const rootPath = root.replace(/^\/+/, '').replace(/\/+$/, '');
    const folderUrl = safeBase + '/' + encodeURIComponent(rootPath).replace(/%2F/g, '/');

    const backupUrl = folderUrl + '/h2o-backup.json';
    const vaultUrl  = folderUrl + '/h2o-vault.json';

    const previewTxt =
      `Folder: ${folderUrl}\n` +
      `Backup: ${backupUrl}\n` +
      `Vault:  ${vaultUrl}`;

    const previewBody = wrap.querySelector('[data-ch-webdav-preview]');
    if (previewBody) previewBody.textContent = previewTxt;

    const sub = wrap.querySelector('[data-ch-webdav-sub]');
    if (sub) {
      const ok = !!(server && baseUrl && fmt(fUser.inp.value));
      sub.textContent = ok ? 'Ready' : 'Fill Server/URL/Username';
      sub.classList.toggle('ok', ok);
    }
  };

  const applyCredsToInputs = (c) => {
    if (!c) return;
    fServer.inp.value = fmt(c.server || '');
    fPort.inp.value   = fmt(c.port || '443');
    fUrl.inp.value    = fmt(c.url || c.baseUrl || '');
    fUser.inp.value   = fmt(c.username || c.user || '');
    fPass.inp.value   = fmt(c.password || '');
    fRoot.inp.value   = fmt(c.root || c.folder || 'H2O');
    remember.checked  = !!c.remember;
  };

  const readInputs = () => {
    const server = fmt(fServer.inp.value);
    const port = parseInt(fmt(fPort.inp.value) || '443', 10);
    const url = fmt(fUrl.inp.value);
    const username = fmt(fUser.inp.value);
    const password = fmt(fPass.inp.value);
    const root = fmt(fRoot.inp.value || 'H2O') || 'H2O';
    const rememberPw = !!remember.checked;

    return {
      schema: 'H2O.sync.webdav.creds.v1',
      updatedAt: new Date().toISOString(),
      server,
      port: Number.isFinite(port) ? port : 443,
      url,
      username,
      password: rememberPw ? password : '',
      remember: rememberPw,
      root,
    };
  };

  const renderStatus = () => {
    const st = loadStatus() || {};
    const lines = [];
    if (!api) lines.push('⚠️ H2O.Data Sync API not loaded yet.');
    if (st?.lastOkAt) lines.push(`✅ Last OK: ${st.lastOkAt}`);
    if (st?.lastError) lines.push(`❌ Last error: ${st.lastError}`);
    if (st?.backup?.lastPushAt) lines.push(`⬆️ Backup push: ${st.backup.lastPushAt}`);
    if (st?.backup?.lastPullAt) lines.push(`⬇️ Backup pull: ${st.backup.lastPullAt}`);
    if (st?.backup?.remoteHash) lines.push(`Backup remote hash: ${st.backup.remoteHash}`);
    if (st?.backup?.conflict) lines.push(`⚠️ Backup conflict: local != remote`);
    if (st?.vault?.lastPushAt) lines.push(`⬆️ Vault push: ${st.vault.lastPushAt}`);
    if (st?.vault?.lastPullAt) lines.push(`⬇️ Vault pull: ${st.vault.lastPullAt}`);
    if (st?.vault?.remoteHash) lines.push(`Vault remote hash: ${st.vault.remoteHash}`);
    if (st?.vault?.conflict) lines.push(`⚠️ Vault conflict: local != remote`);
    const body = wrap.querySelector('[data-ch-webdav-status]');
    if (body) body.textContent = lines.join('\n') || '—';
  };

  const doLink = async () => {
    const creds = readInputs();
    // Always store local copy so other UI can read it.
    saveCreds(creds);

    // If Data API exists: set creds + test now
    if (api?.setCreds) {
      try {
        await api.setCreds({ ...creds, pass: creds.password, rememberPassword: creds.remember });
        const r = await api.test();
        // reflect status update
        renderStatus();
        return r;
      } catch (e) {
        renderStatus();
        alert('WebDAV link/test failed. Check URL + app password.\n\n' + String(e?.message || e || ''));
      }
    } else {
      alert('Saved credentials locally. Load/enable H2O Data (v0.5.0+) to activate WebDAV sync.');
    }
  };

  const doTest = async () => {
    // ensure preview updated + creds persisted
    const creds = readInputs();
    saveCreds(creds);

    if (!api?.test) {
      alert('H2O.Data Sync API not loaded yet.');
      return;
    }
    try {
      await api.setCreds(creds);
      const r = await api.test();
      renderStatus();
      if (r?.ok) alert('WebDAV OK ✅');
      else alert('WebDAV test failed ❌');
    } catch (e) {
      renderStatus();
      alert('WebDAV test failed.\n\n' + String(e?.message || e || ''));
    }
  };

  const doUnlink = async () => {
    clearCreds();
    fPass.inp.value = '';
    remember.checked = false;
    if (api?.clearCreds) {
      try { await api.clearCreds(); } catch {}
    }
    renderStatus();
    normalize();
  };

  // Wire handlers
  btnLink.onclick = (e) => { e.preventDefault(); e.stopPropagation(); void doLink(); };
  btnTest.onclick = (e) => { e.preventDefault(); e.stopPropagation(); void doTest(); };
  btnUnlink.onclick = (e) => { e.preventDefault(); e.stopPropagation(); void doUnlink(); };

  // Keep preview live
  const onInput = () => { normalize(); };
  [fServer.inp, fPort.inp, fUrl.inp, fUser.inp, fPass.inp, fRoot.inp].forEach(inp => {
    inp.addEventListener('input', onInput);
  });

  // Load persisted creds on open
  const c0 = loadCreds();
  applyCredsToInputs(c0);
  normalize();
  renderStatus();

  panel.appendChild(wrap);
}



  function DATA_openWebDAVModal(){
    // one modal at a time
    const existing = UTIL_q('[data-cgxui="modal-webdav"][data-cgxui-owner="'+SkID+'"]');
    if (existing) { try { existing.remove(); } catch {} }

    const api = DATA_getSyncApi()?.webdav || null;

    const modal = document.createElement('div');
    modal.setAttribute(ATTR_CGXUI, 'modal-webdav');
    modal.setAttribute(ATTR_CGXUI_OWNER, SkID);

    // load stored state/creds
    const snap = api?.getState?.();
    const creds = snap?.creds || {};
    const st = snap?.state || {};

    const safe = (v) => String(v ?? '');
    const fmtISO = (s) => s ? String(s).replace('T',' ').replace('Z','') : '—';

    modal.innerHTML = `
      <div class="h2o-wd-card">
        <div class="h2o-wd-head">
          <div class="h2o-wd-title">WebDAV</div>
          <button class="h2o-wd-x" type="button" aria-label="Close">✕</button>
        </div>

        <div class="h2o-wd-grid">
          <label class="h2o-wd-field">
            <div class="h2o-wd-lbl">Server</div>
            <input class="h2o-wd-in" data-k="server" placeholder="app.koofr.net" value="${safe(creds.server)}">
          </label>

          <label class="h2o-wd-field">
            <div class="h2o-wd-lbl">Port</div>
            <input class="h2o-wd-in" data-k="port" placeholder="443" value="${safe(creds.port || '443')}">
          </label>

          <label class="h2o-wd-field h2o-wd-span2">
            <div class="h2o-wd-lbl">URL</div>
            <input class="h2o-wd-in" data-k="baseUrl" placeholder="https://app.koofr.net/dav/Koofr" value="${safe(creds.baseUrl)}">
          </label>

          <label class="h2o-wd-field">
            <div class="h2o-wd-lbl">Username</div>
            <input class="h2o-wd-in" data-k="username" placeholder="you@example.com" value="${safe(creds.username)}">
          </label>

          <label class="h2o-wd-field">
            <div class="h2o-wd-lbl">Password</div>
            <div class="h2o-wd-passrow">
              <input class="h2o-wd-in" data-k="password" type="password" placeholder="••••••••" value="">
              <button class="h2o-wd-eye" type="button" title="Show/Hide">👁️</button>
            </div>
          </label>

          <label class="h2o-wd-field h2o-wd-span2">
            <div class="h2o-wd-lbl">Folder</div>
            <input class="h2o-wd-in" data-k="folder" placeholder="H2O" value="${safe(creds.folder || 'H2O')}">
          </label>
        </div>

        <div class="h2o-wd-row">
          <label class="h2o-wd-check">
            <input type="checkbox" data-k="remember" ${creds.remember ? 'checked' : ''}>
            <span>Remember password on this device</span>
          </label>
          <div class="h2o-wd-chip" data-k="linked">${st.linked ? 'Linked ✅' : 'Unlinked ⚪️'}</div>
        </div>

        <div class="h2o-wd-box">
          <div class="h2o-wd-boxlbl">Connection preview</div>
          <div class="h2o-wd-mono" data-k="preview"></div>
        </div>

        <div class="h2o-wd-box">
          <div class="h2o-wd-boxlbl">Status</div>
          <div class="h2o-wd-mono" data-k="status"></div>
        </div>

        <div class="h2o-wd-actions">
          <button class="h2o-wd-btn" data-act="test" type="button">Test</button>
          <button class="h2o-wd-btn h2o-wd-primary" data-act="link" type="button">Link</button>
          <button class="h2o-wd-btn" data-act="unlink" type="button">Unlink</button>
        </div>

        <div class="h2o-wd-foot">
          Tip: use an app-specific password (Koofr/Nextcloud). URL should be the WebDAV root; Folder is where H2O will store JSON files.
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Modal closes only via top-right X button.


    const q = (sel) => modal.querySelector(sel);
    const qk = (k) => modal.querySelector(`[data-k="${k}"]`);
    const input = (k) => /** @type {HTMLInputElement|null} */ (qk(k));
    const boxPreview = qk('preview');
    const boxStatus  = qk('status');
    const chipLinked = qk('linked');

    function normBaseUrl(url){
      let s = String(url || '').trim();
      s = s.replace(/[\s\r\n\t]+/g,'');
      // collapse repeated schemes
      s = s.replace(/^(https?:\/\/)+(https?:\/\/)/i, (m)=> (m.toLowerCase().includes('https://')?'https://':'http://'));
      if (!/^https?:\/\//i.test(s) && s) s = 'https://' + s;
      try {
        const u = new URL(s);
        u.pathname = (u.pathname||'/').replace(/\/{2,}/g,'/');
        if (u.pathname.length>1) u.pathname = u.pathname.replace(/\/+$/,'');
        u.search=''; u.hash='';
        return u.origin + u.pathname;
      } catch { return s; }
    }

    function computePreview(){
      const baseUrl = normBaseUrl(input('baseUrl')?.value || '');
      const folder = String(input('folder')?.value || 'H2O').trim() || 'H2O';
      if (!boxPreview) return;
      const folderUrl = baseUrl ? [baseUrl.replace(/\/+$/,''), folder.replace(/^\/+|\/+$/g,'')].filter(Boolean).join('/') : '';
      const b = folderUrl ? folderUrl + '/h2o-backup.json' : '';
      const v = folderUrl ? folderUrl + '/h2o-vault.json' : '';
      boxPreview.textContent = folderUrl
        ? `Folder: ${folderUrl}\nBackup: ${b}\nVault:  ${v}`
        : '—';
    }

    function renderStatus(extra){
      const snap2 = api?.getState?.();
      const st2 = snap2?.state || {};
      const hasPassword = !!(snap2?.creds?.hasPassword || st2?.hasPassword);
      const lastErr = st2.lastError ? `Error: ${st2.lastError}` : '';
      const lines = [
        api ? 'API: ready ✅' : 'API: missing ❌ (load H2O Data)',
        `Linked: ${st2.linked ? 'yes' : 'no'}`,
        `Has password: ${hasPassword ? 'yes' : 'no'}`,
        `Last test: ${fmtISO(st2.lastTestAt)} ${st2.lastTestOk ? '✅' : (st2.lastTestAt ? '❌' : '')}`,
        `Last push backup: ${fmtISO(st2.lastPushBackupAt)}`,
        `Last pull backup: ${fmtISO(st2.lastPullBackupAt)}`,
        `Remote hash (backup): ${st2.remoteHashBackup || '—'}`,
        `Last push vault: ${fmtISO(st2.lastPushVaultAt)}`,
        `Last pull vault: ${fmtISO(st2.lastPullVaultAt)}`,
        `Remote hash (vault): ${st2.remoteHashVault || '—'}`,
        lastErr,
        extra ? String(extra) : '',
      ].filter(Boolean);
      if (boxStatus) boxStatus.textContent = lines.join('\n');
      if (chipLinked) chipLinked.textContent = (st2.linked ? 'Linked ✅' : 'Unlinked ⚪️');
    }

    function readCredsFromUI(){
      const baseUrl = normBaseUrl(input('baseUrl')?.value || '');
      const server = String(input('server')?.value || '').trim();
      const port = String(input('port')?.value || '').trim() || '443';
      const username = String(input('username')?.value || '').trim();
      const password = String(input('password')?.value || '');
      const folder = String(input('folder')?.value || 'H2O').trim() || 'H2O';
      const remember = !!(modal.querySelector('input[type="checkbox"][data-k="remember"]')?.checked);

      // If URL present, derive server/port for convenience
      let srv = server, prt = port;
      try {
        if (baseUrl) {
          const u = new URL(baseUrl);
          srv = u.hostname;
          prt = String(u.port || (u.protocol === 'https:' ? '443' : '80'));
        }
      } catch {}

      const out = { baseUrl, url: baseUrl, server: srv, port: prt, username, remember, folder };
      if (password.length > 0) out.password = password;
      return out;
    }

    function normSyncErr(v){
      const s = String(v || '').trim();
      if (/Maximum call stack size exceeded/i.test(s)) return 'provider recursion guard (stale/duplicate scripts loaded)';
      return s || 'unknown error';
    }

    async function doTest(label){
      computePreview();
      if (!api) { renderStatus('H2O Sync not loaded.'); return; }
      try {
        const c = readCredsFromUI();
        const ok = api.setCreds?.(c);
        if (ok === false) throw new Error('Failed to save WebDAV credentials locally.');
        renderStatus('Testing… ⏳');
        const res = await api.test?.();
        const reason = normSyncErr(res?.message || res?.step || res?.reason || 'unknown error');
        renderStatus(res?.ok ? `Test OK ✅ ${res?.status || ''}`.trim()
          : `Test failed ❌ (${(res && ('status' in res)) ? String(res.status) : ''}) ${reason}`.trim());
      } catch (e) {
        renderStatus(`Test failed ❌ ${normSyncErr(e?.message || e)}`);
      }
    }

    async function doLink(){
      computePreview();
      if (!api) { renderStatus('H2O Sync not loaded.'); return; }
      try {
        const c = readCredsFromUI();
        const ok = api.setCreds?.(c);
        if (ok === false) throw new Error('Failed to save WebDAV credentials locally.');
        renderStatus('Linking… ⏳');
        const res = await api.test?.();
        const reason = normSyncErr(res?.message || res?.step || res?.reason || 'unknown error');
        renderStatus(res?.ok ? `Linked ✅ (folder: ${res.folderUrl || ''})`
          : `Link failed ❌ (${(res && ('status' in res)) ? String(res.status) : ''}) ${reason}`.trim());
      } catch (e) {
        renderStatus(`Link failed ❌ ${normSyncErr(e?.message || e)}`);
      }
    }

    function doUnlink(){
      if (!api) { renderStatus('H2O Sync not loaded.'); return; }
      try {
        renderStatus('Unlinking… ⏳');
        api.clearCreds?.();
        if (input('password')) input('password').value = '';
        renderStatus('Unlinked ✅');
      } catch (e) {
        renderStatus(`Unlink failed ❌ ${e?.message || e}`);
      }
    }

    // wire
    q('.h2o-wd-x')?.addEventListener('click', (e) => { e?.stopPropagation?.(); try { modal.remove(); } catch {} });

    // Keep backdrop clicks inert and prevent bubbling into page overlays.
    modal.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // show/hide password
    q('.h2o-wd-eye')?.addEventListener('click', () => {
      const p = input('password');
      if (!p) return;
      p.type = (p.type === 'password') ? 'text' : 'password';
      const eye = q('.h2o-wd-eye');
      if (eye) eye.textContent = (p.type === 'text') ? '🙈' : '👁️';
    });

    // preview live + soft-save creds (esp. remember checkbox)
    function softSaveCreds(){
      if (!api?.setCreds) { renderStatus(); return; }
      try { api.setCreds(readCredsFromUI()); } catch {}
      renderStatus();
    }

    ['server','port','baseUrl','username','folder'].forEach(k => {
      input(k)?.addEventListener('input', () => { computePreview(); });
      input(k)?.addEventListener('change', () => { softSaveCreds(); });
    });
    input('password')?.addEventListener('change', () => { softSaveCreds(); });
    input('remember')?.addEventListener('change', () => { softSaveCreds(); });

    // actions
    modal.querySelector('[data-act="test"]')?.addEventListener('click', () => doTest());
    modal.querySelector('[data-act="link"]')?.addEventListener('click', () => doLink());
    modal.querySelector('[data-act="unlink"]')?.addEventListener('click', () => doUnlink());

    // initial render
    computePreview();
    renderStatus();
  }



async function DATA_syncPushBackupAction() {
  const api = DATA_getSyncApi();
  if (!api?.pushBackup) { alert('H2O Data API missing ❌'); return; }

  let res = null;
  try {
    res = await api.pushBackup({});
  } catch (e) {
    alert(`Push Backup failed ❌
${(e && e.message) ? e.message : String(e)}`);
    return;
  }

  if (!res?.ok) {
    if (res?.conflict) {
      const ok = confirm(`Backup conflict detected ⚠️

Remote backup is different from your local state.

• Recommended: click “Sync — Pull (Backup)” first on this system, review, then push again.
• If you want to overwrite remote with THIS system now: click OK to Force Push.
`);
      if (!ok) { alert('Push cancelled (conflict)'); return; }
      try {
        res = await api.pushBackup({ force: true });
      } catch (e) {
        alert(`Force Push failed ❌
${(e && e.message) ? e.message : String(e)}`);
        return;
      }
    }
  }

  if (!res?.ok) { alert(`Push Backup failed ❌
${res?.reason || res?.error || 'Unknown failure'}`); return; }

  const rep = DATA_alertReport('Push Backup done ✅', res.report || {});
  return { message: `Push OK ✅ (applied ${rep.appliedN})` };
}

async function DATA_syncPullBackupAction() {
  const api = DATA_getSyncApi();
  if (!api?.pullBackup) { alert('H2O Data API missing ❌'); return; }

  // ⚠️ Overwrite semantics (user-requested): remote backup becomes your LOCAL truth.
  const ok = confirm(`Sync — Pull (Backup) will OVERWRITE your local H2O store with the remote backup.

If you want to keep local changes, click Cancel and use Vault or Manual export instead.

Continue?`);
  if (!ok) return;

  let res = null;
  try {
    res = await api.pullBackup({ mode: 'overwrite' });
  } catch (e) {
    alert(`Pull Backup failed ❌
${(e && e.message) ? e.message : String(e)}`);
    return;
  }

  if (!res?.ok) { alert(`Pull Backup failed ❌
${res?.reason || res?.error || 'Unknown failure'}`); return; }

  const rep = res.report || {};
  alert(`Pull Backup done ✅ (overwrite)
Applied: ${rep.applied ?? 0}
Skipped: ${rep.skipped ?? 0}
Failed: ${rep.failed ?? 0}`);
  return { message: `Pull OK ✅ (overwrite, applied ${rep.applied ?? 0})` };
}

async function DATA_syncPushVaultAction() {
  const api = DATA_getSyncApi();
  if (!api?.pushVault) { alert('H2O Data API missing ❌'); return; }

  let res = null;
  try {
    res = await api.pushVault({});
  } catch (e) {
    alert(`Push Vault failed ❌
${(e && e.message) ? e.message : String(e)}`);
    return;
  }

  if (!res?.ok) {
    if (res?.conflict) {
      const ok = confirm(`Vault conflict detected ⚠️

Remote vault is different from your local state.

• Recommended: click “Sync — Pull (Vault)” first on this system, review, then push again.
• If you want to overwrite remote with THIS system now: click OK to Force Push.
`);
      if (!ok) { alert('Push cancelled (conflict)'); return; }
      try {
        res = await api.pushVault({ force: true });
      } catch (e) {
        alert(`Force Push failed ❌
${(e && e.message) ? e.message : String(e)}`);
        return;
      }
    }
  }

  if (!res?.ok) { alert(`Push Vault failed ❌
${res?.reason || res?.error || 'Unknown failure'}`); return; }

  const rep = DATA_alertReport('Push Vault done ✅', res.report || {});
  return { message: `Push Vault OK ✅ (applied ${rep.appliedN})` };
}

async function DATA_syncPullVaultAction() {
  const api = DATA_getSyncApi();
  if (!api?.pullVault) { alert('H2O Data API missing ❌'); return; }

  let res = null;
  try {
    res = await api.pullVault({});
  } catch (e) {
    alert(`Pull Vault failed ❌
${(e && e.message) ? e.message : String(e)}`);
    return;
  }

  if (!res?.ok) { alert(`Pull Vault failed ❌
${res?.reason || res?.error || 'Unknown failure'}`); return; }

  const rep = DATA_alertReport('Pull Vault done ✅', res.report || {});
  return { message: `Pull Vault OK ✅ (applied ${rep.appliedN})` };
}

})();
