// ==UserScript==
// @h2o-id             0d3d.transcript.save.strip
// @name               0D3d.⚫️🗄️ Transcript Save Strip ⏺️🗂️🗄️
// @namespace          H2O.Premium.CGX.transcript.save.strip
// @author             HumamDev
// @version            1.2.0
// @revision           001
// @build              260404-000000
// @description        Transcript Save Strip: lightweight save confirmation strip for chatgpt.com, injected after snapshot capture with folder assignment, pin/archive controls, and auto-dismiss behavior.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==


/* ═══════════════════════════════════════════════════════════
 *  H2O Archive Save Strip
 * 
 *  Instapaper-style save notification bar for chatgpt.com
 *
 *  Injected after a snapshot capture. Appears at the top of
 *  the page matching ChatGPT's topbar height (52px), with
 *  folder assignment, pin, archive controls.
 *
 *  Auto-dismisses after STRIP_DURATION_MS (default 4500ms).
 *  Pauses timer while interacting with controls.
 *
 *  Integration:
 *    H2O.archiveSaveStrip.show({ chatId, snapshotId, title, folderId })
 *    H2O.archiveSaveStrip.dismiss()
 *
 *  Expected to be called from 0D3a archive engine after
 *  captureWithOptions() or captureNow() completes.
 * ═══════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const TAG = "[H2O.SaveStrip]";
  const STRIP_DURATION_MS = 4500;
  const STRIP_INTERACT_DURATION_MS = 8000;
  const TOPBAR_HEIGHT = 52; // matches ChatGPT --topbar-h

  const STRIP_CSS_ID = "h2o-save-strip-css";
  const STRIP_ROOT_ID = "h2o-save-strip";

  // ─── State ───
  const state = {
    root: null,
    progressEl: null,
    folderDropdown: null,
    folderPill: null,
    folderLabelEl: null,
    animFrame: null,
    startTime: 0,
    duration: STRIP_DURATION_MS,
    paused: false,
    pausedAt: 0,
    chatId: "",
    snapshotId: "",
    currentFolderId: "",
    currentFolderName: "",
    visible: false,
    cssInjected: false,
  };

  // ─── Helpers ───
  function warn(...a) { try { console.warn(TAG, ...a); } catch {} }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

  function getFoldersList() {
    try {
      if (typeof H2O.folders?.list === "function") return H2O.folders.list() || [];
      if (typeof H2O.archiveBoot?.getFoldersList === "function") return H2O.archiveBoot.getFoldersList() || [];
      return [];
    } catch {
      return [];
    }
  }

  function setFolderBinding(chatId, folderId) {
    try { return H2O.archiveBoot?.setFolderBinding?.(chatId, folderId); } catch (e) { warn("setFolderBinding failed", e); }
  }

  function openWorkbench(route) {
    try { return H2O.archiveBoot?.openWorkbench?.(route); } catch (e) { warn("openWorkbench failed", e); }
  }

  function pinSnapshot(snapshotId, pinned) {
    try { return H2O.archiveBoot?.pinSnapshot?.(snapshotId, pinned); } catch (e) { warn("pinSnapshot failed", e); }
  }

  // ─── CSS ───
  function injectCSS() {
    if (state.cssInjected || D.getElementById(STRIP_CSS_ID)) { state.cssInjected = true; return; }
    const style = D.createElement("style");
    style.id = STRIP_CSS_ID;
    style.textContent = `
#${STRIP_ROOT_ID}{
  position:fixed;top:0;left:0;right:0;
  height:${TOPBAR_HEIGHT}px;
  background:rgba(26,26,26,.97);
  backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 16px;
  z-index:2147483710;
  transform:translateY(-100%);opacity:0;
  transition:transform .32s cubic-bezier(.4,0,.2,1),opacity .28s ease;
  border-bottom:1px solid rgba(255,255,255,.08);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","Helvetica Neue",sans-serif;
  box-sizing:border-box;
  pointer-events:none;
}
#${STRIP_ROOT_ID}.h2o-ss-visible{transform:translateY(0);opacity:1;pointer-events:auto}
#${STRIP_ROOT_ID}.h2o-ss-exiting{transform:translateY(-100%);opacity:0;pointer-events:none}
#${STRIP_ROOT_ID} *{box-sizing:border-box;margin:0;padding:0}

.h2o-ss-left{display:flex;align-items:center;gap:10px;min-width:0}
.h2o-ss-check{
  width:22px;height:22px;border-radius:50%;
  background:#1d9e75;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.h2o-ss-check svg{width:13px;height:13px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.h2o-ss-label{font-size:14px;font-weight:600;color:#ececec;white-space:nowrap}
.h2o-ss-sublabel{font-size:12px;color:#8f8f8f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}

.h2o-ss-center{display:flex;align-items:center;gap:8px;flex-shrink:0}
.h2o-ss-pill{
  display:flex;align-items:center;gap:5px;
  height:28px;padding:0 10px;border-radius:8px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.04);
  color:#afafaf;font-size:12px;cursor:pointer;white-space:nowrap;
  transition:border-color .15s,background .15s,color .15s;
}
.h2o-ss-pill:hover{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#ececec}
.h2o-ss-pill svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.h2o-ss-pill.h2o-ss-active{border-color:#1d9e75;background:rgba(29,158,117,.15);color:#ececec}
.h2o-ss-pill-pin{border-color:rgba(247,211,74,.25)!important;background:rgba(247,211,74,.06)!important}
.h2o-ss-pill-pin.h2o-ss-active{border-color:rgba(247,211,74,.5)!important;background:rgba(247,211,74,.14)!important}

.h2o-ss-divider{width:1px;height:20px;background:rgba(255,255,255,.08);flex-shrink:0}

.h2o-ss-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.h2o-ss-btn{
  height:28px;padding:0 12px;border-radius:8px;
  border:1px solid rgba(255,255,255,.14);
  background:transparent;color:#ececec;font-size:12px;font-weight:500;
  cursor:pointer;transition:background .15s;
  display:flex;align-items:center;gap:5px;white-space:nowrap;
  font-family:inherit;
}
.h2o-ss-btn:hover{background:rgba(255,255,255,.08)}
.h2o-ss-btn-primary{background:#1d9e75!important;border-color:#1d9e75!important;color:#fff!important}
.h2o-ss-btn-primary:hover{background:#1aad80!important}
.h2o-ss-close{
  width:28px;height:28px;border-radius:6px;border:none;
  background:transparent;color:#8f8f8f;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:background .15s;
}
.h2o-ss-close:hover{background:rgba(255,255,255,.08);color:#ececec}
.h2o-ss-close svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

.h2o-ss-progress{
  position:absolute;bottom:-1px;left:0;height:2px;
  background:#1d9e75;border-radius:0 1px 1px 0;
  transition:width .1s linear;
}

.h2o-ss-dropdown{
  position:absolute;top:${TOPBAR_HEIGHT + 4}px;left:50%;transform:translateX(-50%);
  background:#2f2f2f;border:1px solid rgba(255,255,255,.14);border-radius:10px;
  padding:4px;min-width:160px;z-index:2147483711;
  display:none;box-shadow:0 8px 24px rgba(0,0,0,.35);
}
.h2o-ss-dropdown.h2o-ss-open{display:block}
.h2o-ss-dd-item{
  padding:8px 12px;border-radius:7px;font-size:13px;color:#ececec;
  cursor:pointer;transition:background .12s;font-family:inherit;
}
.h2o-ss-dd-item:hover{background:rgba(255,255,255,.08)}
.h2o-ss-dd-item.h2o-ss-selected{background:rgba(29,158,117,.15);color:#ececec}
.h2o-ss-dd-item.h2o-ss-selected::before{
  content:"";display:inline-block;width:6px;height:6px;border-radius:50%;
  background:#1d9e75;margin-right:8px;vertical-align:middle;
}
@media(max-width:640px){
  .h2o-ss-center{display:none}
  .h2o-ss-sublabel{display:none}
}
`;
    D.head.appendChild(style);
    state.cssInjected = true;
  }

  // ─── DOM ───
  function ensureDOM() {
    if (state.root) return;
    injectCSS();

    const root = D.createElement("div");
    root.id = STRIP_ROOT_ID;
    root.innerHTML = `
      <div class="h2o-ss-left">
        <div class="h2o-ss-check"><svg viewBox="0 0 24 24"><polyline points="6 12 10 16 18 8"/></svg></div>
        <div>
          <div class="h2o-ss-label">Saved</div>
          <div class="h2o-ss-sublabel" data-ref="sublabel">Snapshot captured</div>
        </div>
      </div>
      <div class="h2o-ss-center">
        <div class="h2o-ss-pill" data-ref="folderPill">
          <svg viewBox="0 0 24 24"><path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4h3.7a1 1 0 0 1 .7.3L12 6h6.5A1.5 1.5 0 0 1 20 7.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/></svg>
          <span data-ref="folderLabel">Unfiled</span>
        </div>
        <div class="h2o-ss-pill" data-ref="archivePill">
          <svg viewBox="0 0 24 24"><path d="M5 7h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7Z"/><path d="M4 5h16v2H4z"/><path d="M9 11h6"/></svg>
          Archive
        </div>
        <div class="h2o-ss-divider"></div>
        <div class="h2o-ss-pill h2o-ss-pill-pin" data-ref="pinPill">
          <svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          Pin
        </div>
      </div>
      <div class="h2o-ss-right">
        <button class="h2o-ss-btn h2o-ss-btn-primary" data-ref="studioBtn">Studio</button>
        <button class="h2o-ss-close" data-ref="closeBtn">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="h2o-ss-progress" data-ref="progress"></div>
      <div class="h2o-ss-dropdown" data-ref="folderDropdown"></div>
    `;

    (D.body || D.documentElement).appendChild(root);
    state.root = root;

    // Cache refs
    const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
    state.progressEl = ref("progress");
    state.folderDropdown = ref("folderDropdown");
    state.folderPill = ref("folderPill");
    state.folderLabelEl = ref("folderLabel");
    const sublabel = ref("sublabel");
    const archivePill = ref("archivePill");
    const pinPill = ref("pinPill");
    const studioBtn = ref("studioBtn");
    const closeBtn = ref("closeBtn");
    state.studioBtn = studioBtn;

    // Events
    state.folderPill.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pauseTimer();
      toggleFolderDropdown();
    });

    archivePill.addEventListener("click", () => {
      archivePill.classList.toggle("h2o-ss-active");
      pauseTimer();
      resetTimerLong();
    });

    pinPill.addEventListener("click", async () => {
      const nowActive = !pinPill.classList.contains("h2o-ss-active");
      pinPill.classList.toggle("h2o-ss-active", nowActive);
      pauseTimer();
      if (state.snapshotId) {
        try { await pinSnapshot(state.snapshotId, nowActive); } catch {}
      }
      resetTimerLong();
    });

    studioBtn.addEventListener("click", async () => {
      dismiss();
      try {
        const route = state.snapshotId ? `/read/${encodeURIComponent(state.snapshotId)}` : "/saved";
        await openWorkbench(route);
      } catch (e) { warn("open studio failed", e); }
    });

    closeBtn.addEventListener("click", () => dismiss());

    // Close dropdown on outside click
    D.addEventListener("click", (ev) => {
      if (!ev.target.closest(`[data-ref="folderPill"]`) && !ev.target.closest(`[data-ref="folderDropdown"]`)) {
        state.folderDropdown.classList.remove("h2o-ss-open");
      }
    });
  }

  // ─── Folder dropdown ───
  function toggleFolderDropdown() {
    const dd = state.folderDropdown;
    const isOpen = dd.classList.contains("h2o-ss-open");
    if (isOpen) { dd.classList.remove("h2o-ss-open"); return; }

    // Build items
    const folders = getFoldersList();
    const items = [{ id: "", name: "Unfiled" }, ...folders.map(f => ({ id: f.id || f.folderId || "", name: f.name || f.title || f.id || "" }))];
    dd.innerHTML = "";
    items.forEach(item => {
      const el = D.createElement("div");
      el.className = "h2o-ss-dd-item" + (String(item.id || "") === String(state.currentFolderId || "") ? " h2o-ss-selected" : "");
      el.textContent = item.name;
      el.addEventListener("click", () => selectFolder(item.id, item.name));
      dd.appendChild(el);
    });
    dd.classList.add("h2o-ss-open");
  }

  async function selectFolder(folderId, folderName) {
    state.currentFolderId = String(folderId || "");
    state.currentFolderName = folderName || "Unfiled";
    state.folderLabelEl.textContent = state.currentFolderName;
    state.folderDropdown.classList.remove("h2o-ss-open");
    state.folderPill.classList.toggle("h2o-ss-active", !!state.currentFolderId);

    if (state.chatId) {
      try { await setFolderBinding(state.chatId, state.currentFolderId); } catch {}
    }
    resetTimerLong();
  }

  // ─── Timer ───
  function startProgress() {
    state.startTime = Date.now();
    state.paused = false;
    state.duration = STRIP_DURATION_MS;
    tick();
  }

  function tick() {
    if (state.paused) return;
    const elapsed = Date.now() - state.startTime;
    const pct = Math.max(0, 100 - ((elapsed / state.duration) * 100));
    if (state.progressEl) state.progressEl.style.width = pct + "%";
    if (pct > 0) {
      state.animFrame = requestAnimationFrame(tick);
    } else {
      dismiss();
    }
  }

  function pauseTimer() {
    state.paused = true;
    state.pausedAt = Date.now();
    if (state.animFrame) cancelAnimationFrame(state.animFrame);
  }

  function resetTimerLong() {
    state.startTime = Date.now();
    state.duration = STRIP_INTERACT_DURATION_MS;
    state.paused = false;
    tick();
  }

  function clearTimer() {
    if (state.animFrame) cancelAnimationFrame(state.animFrame);
    state.animFrame = null;
    state.paused = false;
  }

  // ─── Public API ───
  function show(opts = {}) {
    ensureDOM();
    clearTimer();

    state.chatId = String(opts.chatId || "").trim();
    state.snapshotId = String(opts.snapshotId || "").trim();
    state.currentFolderId = String(opts.folderId || "").trim();
    state.currentFolderName = String(opts.folderName || "Unfiled").trim();

    // Update labels
    const sublabel = state.root.querySelector('[data-ref="sublabel"]');
    if (sublabel) sublabel.textContent = opts.title ? `Saved: ${opts.title}` : "Snapshot captured";
    if (state.folderLabelEl) state.folderLabelEl.textContent = state.currentFolderName || "Unfiled";
    state.folderPill.classList.toggle("h2o-ss-active", !!state.currentFolderId);
    if (state.studioBtn) {
      const hasSnapshot = !!state.snapshotId;
      state.studioBtn.textContent = hasSnapshot ? 'Latest Snapshot' : 'Studio';
      state.studioBtn.title = hasSnapshot ? 'Open the latest snapshot in Studio' : 'Open Studio';
      state.studioBtn.setAttribute('aria-label', state.studioBtn.title);
    }

    // Reset pin/archive states
    state.root.querySelector('[data-ref="pinPill"]')?.classList.remove("h2o-ss-active");
    state.root.querySelector('[data-ref="archivePill"]')?.classList.remove("h2o-ss-active");

    // Show
    state.root.classList.remove("h2o-ss-exiting");
    state.root.classList.add("h2o-ss-visible");
    state.visible = true;

    startProgress();
  }

  function dismiss() {
    clearTimer();
    if (!state.root) return;
    state.folderDropdown?.classList.remove("h2o-ss-open");
    state.root.classList.add("h2o-ss-exiting");
    state.root.classList.remove("h2o-ss-visible");
    state.visible = false;
  }

  function isVisible() {
    return state.visible;
  }

  // ─── Export ───
  const api = { show, dismiss, isVisible };
  H2O.archiveSaveStrip = api;

  // Flush any show calls queued by 0D3a before this script finished loading.
  // This handles the timing edge case where a capture completes while 0D3d
  // is still being parsed/executed (common on slow pages or large script bundles).
  try {
    const queue = H2O._saveStripQueue;
    if (Array.isArray(queue) && queue.length) {
      H2O._saveStripQueue = null;
      // Use a short delay so the DOM is fully settled before the strip appears
      W.setTimeout(() => {
        const latest = queue[queue.length - 1];
        if (!latest) return;
        try { api.show(latest); } catch {}
      }, 150);
    }
  } catch {}

})();