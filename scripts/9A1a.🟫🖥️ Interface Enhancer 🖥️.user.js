// ==UserScript==
// @h2o-id      9a.interface.enhancer
// @name         9a.🟫🖥️ Interface Enhancer 🖥️
// @namespace    hobayda
// @version      6.3
// @description  Tiny color button beside each chat; choose dot + row color (toggle to clear), sidebar + project lists
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  // ---- config ----
  const COLORS = [
    { name: "gold",  value: "rgba(212,175,55,1)" },
    { name: "red",   value: "rgba(179,58,58,1)" },
    { name: "blue",  value: "rgba(70,100,200,1)" },
    { name: "green", value: "rgba(60,150,90,1)" }
  ];

document.documentElement.classList.add("ho-meta-boot");

  const DOT_KEY = id => `ho:chat-dot-idx:${id}`;
  const ROW_KEY = id => `ho:chat-row-idx:${id}`;

const LASTSEEN_KEY  = id => `ho:chat-lastseen:${id}`;

const META_KEY = "ho:chat-meta-v1";
const OVERRIDE_KEY = id => `ho:chat-heat-override:${id}`; // auto|hot|warm|cold|off

const PIN_KEY = id => `ho:chat-pin:${id}`;

function loadMetaStore() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); }
  catch { return {}; }
}

function getLastActivityTs(chatId) {
  const meta = loadMetaStore();
  const m = meta?.[chatId];
  const seen = parseInt(localStorage.getItem(LASTSEEN_KEY(chatId)) || "0", 10);
return Math.max(seen, (m?.updatedAt || 0), (m?.createdAt || 0));

}

function getHeatLevel(chatId) {
  const ov = (localStorage.getItem(OVERRIDE_KEY(chatId)) || "auto");
  if (ov !== "auto") return ov;

  const t = getLastActivityTs(chatId);
  if (!t) return "off";

  const ageHrs = (Date.now() - t) / 36e5;
  if (ageHrs <= 24) return "hot";
  if (ageHrs <= 24 * 7) return "warm";
  if (ageHrs <= 24 * 30) return "cold";
  return "off";
}

function applyHeatToBtn(btn, chatId) {
  if (!btn || !chatId) return;
  btn.classList.remove("ho-heat-hot","ho-heat-warm","ho-heat-cold","ho-heat-off");
  btn.classList.add("ho-heat-" + getHeatLevel(chatId));
}

// ---- style ----
const style = document.createElement("style");
style.textContent = `

/* =========================================================
   0) Base marker
   ========================================================= */
.ho-has-colorbtn { position: relative !important; }

/* =========================================================
   1) Layout: Chat links spacing (Sidebar vs Main)
   ========================================================= */

/* Sidebar chat list */
nav a.ho-has-colorbtn-side {
  padding-left: 10px !important;     /* normal */
  padding-right: 18px !important;    /* room for right pill */
  pointer-events: auto !important;
  margin-bottom: 4px !important;
}


/* Project / Folder list (main content) */
main a.ho-has-colorbtn-main {
  padding-left: 32px !important;   /* more room for tall bar */
  pointer-events: auto !important;
  position: relative; z-index: 1;
}

/* =========================================================
   2) Color button (vertical bar): Base + Variants
   ========================================================= */

.ho-colorbtn {
  position: absolute; /* shared base; details handled by -main / -side */
}

/* ——— Project/Folders: Premium Vertical Bar ——— */
.ho-colorbtn-main {
  position: absolute;
  left: 7px;               /* correct spacing for project view */
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 32px;
  border-radius: 999px;

  background: transparent;

  border: 1px solid rgba(210,215,225,0.85);

  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);

  cursor: pointer;
  opacity: 0.95;
  transition: opacity .15s, transform .15s, box-shadow .15s;
}

.ho-colorbtn-main:hover {
  opacity: 1;
  transform: translateY(-50%) scaleX(1.12);
  box-shadow:
    0 0 0 1px rgba(230,235,245,0.6),
    0 0 8px rgba(230,235,245,0.3);
}

/* ——— Sidebar: Compact Vertical Bar ——— */

.ho-colorbtn-side {
  position: absolute;

  left: auto !important;
  right: 6px !important;   /* tweak 4–10px to taste */

  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 18px;

  border-radius: 999px;

  /* premium silver frame */
  border: 1px solid rgba(210,215,225,0.85);

  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);

  opacity: 0.9;
  cursor: pointer;
  transition: opacity .15s, transform .15s, box-shadow .15s;
}

.ho-colorbtn-side:hover {
  opacity: 1;
  transform: translateY(-50%) scaleX(1.12);
  box-shadow:
    0 0 0 1px rgba(230,235,245,0.9),
    0 0 8px rgba(230,235,245,0.9);
}

/* ---------------------------------------------------------
   Heat indicator (LEFT PILL ONLY) 🌡️
   --------------------------------------------------------- */
.ho-colorbtn.ho-heat-off  { opacity: 0.30 !important; box-shadow: none !important; }
.ho-colorbtn.ho-heat-cold { opacity: 0.55 !important; box-shadow: 0 0 6px rgba(255,255,255,0.10) !important; }
.ho-colorbtn.ho-heat-warm { opacity: 0.80 !important; box-shadow: 0 0 10px rgba(255,255,255,0.22) !important; }
.ho-colorbtn.ho-heat-hot  { opacity: 0.98 !important; box-shadow: 0 0 14px rgba(255,255,255,0.35), 0 0 26px rgba(255,255,255,0.18) !important; }

/* =========================================================
   3) Palette UI (popup) + Swatches
   ========================================================= */

.ho-palette {
  position: absolute;
  display: none;

  /* ✅ SOLID BLACK */
  background: #000 !important;
  opacity: 1 !important;

  border: 1px solid rgba(255,255,255,0.14) !important;
  border-radius: 10px !important;
  padding: 8px 10px !important;

  /* ✅ ALWAYS ABOVE EVERYTHING */
  z-index: 2147483647 !important;

  /* ✅ KILL any transparency/bleed effects from filters/blends */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  isolation: isolate !important;

  box-shadow: 0 12px 30px rgba(0,0,0,0.85) !important;
  white-space: nowrap;
  flex-direction: column;
  gap: 4px;
}

/* force palette to be solid + never blend in project list */
main .ho-palette {
  background: #000 !important;
  opacity: 1 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  filter: none !important;
  isolation: isolate !important;
  z-index: 2147483647 !important;
}

/* ⬅ different positions for sidebar vs project list */
.ho-palette-sidebar {
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
}

.ho-palette-main {
  right: 100%;
  margin-right: 6px;
  top: 50%;
  transform: translateY(-50%);
}

.ho-palette-main-right {
  left: 24px;
  right: auto;
  margin-left: 0;
  margin-right: 0;
}

.ho-palette-row {
  display: flex;
  flex-direction: row;
  gap: 6px;
  justify-content: center;
}

.ho-swatch {
  border: 1px solid rgba(255,255,255,0.22);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.ho-swatch:hover {
  transform: scale(1.15);
  box-shadow: 0 0 6px rgba(255,255,255,0.35);
}

/* visual difference: dot vs row */
.ho-swatch.dot {
  width: 13px;
  height: 13px;
  border-radius: 999px;          /* circle */
}
.ho-swatch.row {
  width: 20px;
  height: 10px;
  border-radius: 4px;            /* rounded rectangle */
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);
}

/* 🌡️ Heat swatches: bigger + readable */
.ho-swatch.heat{
  width: 18px !important;
  height: 18px !important;
  border-radius: 6px !important;

  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  color: rgba(255,255,255,0.88) !important;

  background: rgba(255,255,255,0.08) !important;
  border: 1px solid rgba(255,255,255,0.22) !important;
}

/* ✅ Floating/Portaled palette: HARD override all main/sidebar positioning */
.ho-palette.ho-floating{
  position: fixed !important;

  margin: 0 !important;
  transform: translateY(-50%) !important;

  display: none !important; /* controlled by .show */
  background: #000 !important;
  opacity: 1 !important;

  z-index: 2147483647 !important;
  isolation: isolate !important;

  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  filter: none !important;

  pointer-events: auto !important;
}

.ho-palette.ho-floating.show{
  display: inline-flex !important;
}

/* safety: rows must ALWAYS be flex */
.ho-palette-row{ display:flex !important; }

.ho-palette, .ho-swatch { pointer-events: auto !important; }

/* =========================================================
   4) Sidebar row colors + default gray highlight
   ========================================================= */

/* --- Sidebar row highlight (simple background on link) --- */
a.ho-has-colorbtn.ho-row-gold  { background-color: rgba(212,175,55,0.12) !important; }
a.ho-has-colorbtn.ho-row-red   { background-color: rgba(179,58,58,0.15) !important; }
a.ho-has-colorbtn.ho-row-blue  { background-color: rgba(70,100,200,0.15) !important; }
a.ho-has-colorbtn.ho-row-green { background-color: rgba(60,150,90,0.15) !important; }

/* Default subtle gray highlight for *sidebar* chats with no custom color */
nav a.ho-has-colorbtn:not(.ho-row-gold):not(.ho-row-red):not(.ho-row-blue):not(.ho-row-green) {
  background-color: rgba(255, 255, 255, 0.04);  /* tweak alpha for stronger/weaker */
  border-radius: 8px;                           /* optional, to match your style */
}

/* =========================================================
   5) Project list row container (glass band) + overrides
   ========================================================= */

.ho-main-row {
  position: relative;
  border-radius: 10px;
  overflow: visible !important;
  margin-bottom: 3px;   /* adjust to 4px, 8px, etc. */
}

/* Single glass layer: color + hover lives here */
.ho-main-row::before {
  content: "";
  position: absolute;
  top: 2px;
  bottom: -1px;
  left: 1px;
  right: 1px;

  border-radius: inherit;
  border: 1px solid rgba(255,255,255,0.12);

  /* glass */
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);

  opacity: 0.55;
  z-index: 0;

  /* start with NO hover shadow */
  box-shadow: none;
  transition:
    box-shadow .18s ease,
    border-color .18s ease,
    opacity .18s ease;
}

/* ✅ Let clicks pass through the glass overlay in MAIN list */
.ho-main-row::before { pointer-events: none !important; }

/* ✅ Ensure the pill is above everything in MAIN list */
main a.ho-has-colorbtn-main .ho-colorbtn-main { z-index: 5 !important; }

/* Kill ChatGPT's native hover + shadow on row + inner card */
main a[href*="/c/"],
main a[href*="/c/"] > div {
  background: none !important;
  box-shadow: none !important;
}

/* Also kill focus outline so it doesn’t add a white ring */
main a[href*="/c/"]:focus-visible {
  outline: none !important;
}

/* Color variants for the glass band */
.ho-main-row.ho-row-gold::before  { background-color: rgba(212,175,55,0.25); }
.ho-main-row.ho-row-red::before   { background-color: rgba(179,58,58,0.25); }
.ho-main-row.ho-row-blue::before  { background-color: rgba(70,100,200,0.25); }
.ho-main-row.ho-row-green::before { background-color: rgba(60,150,90,0.25); }

/* Remove ChatGPT's native hover highlight */
main a[href*="/c/"]:hover {
  background: none !important;
  box-shadow: none !important;
}

/* Apply a perfect hover shadow on the glass block */
.ho-main-row:hover::before {
  transform: translateY(-1px);
  transition: transform .15s ease, box-shadow .15s ease;

  box-shadow:
    0 2px 6px rgba(0,0,0,0.22),
    0 4px 14px rgba(0,0,0,0.28); /* Adjust strength */

  border: 1px solid rgba(255,255,255,0.18);
}

.ho-pinned-row::before{
  border-color: rgba(255,255,255,0.22) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08) !important;
}


/* =========================================================
   6) Sidebar Projects/Folders — Premium section chips
   ========================================================= */

nav a.ho-project-row {
  width: calc(100% - 3px) !important;
  box-sizing: border-box !important;

  padding: 10px 12px !important;

  margin-top: 5px !important;
  margin-bottom: 5px !important;
  margin-left: 3px;
  margin-right: 0px;
  transform: translateX(2px);

  position: relative !important;
  border-radius: 12px !important;

  background: rgba(255,255,255,0.06) !important;

  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.10),
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 8px 22px rgba(0,0,0,0.45) !important;

  transition: background .15s ease, box-shadow .15s ease;
}

/* subtle sheen overlay (modern premium) */
nav a.ho-project-row::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: inherit !important;
  pointer-events: none !important;

  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.08),
    rgba(255,255,255,0.02) 40%,
    rgba(0,0,0,0.00) 100%
  ) !important;

  opacity: 0.9 !important;
}

nav a.ho-project-row:hover {
  background: rgba(255,255,255,0.075) !important;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.14),
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 10px 26px rgba(0,0,0,0.55) !important;
}

/* =========================================================
   7) Sidebar controls: See All + See more (identical)
   ========================================================= */

:where(nav, aside) .ho-seeall {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  min-height: 28px !important;
  padding: 6px 10px !important;

  width: calc(100% - 14px) !important;
  margin: 6px 7px !important;

  border-radius: 9px !important;

  background: rgba(255,255,255,0.035) !important;
  color: rgba(255,255,255,0.75) !important;

  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.05),
    0 3px 10px rgba(0,0,0,0.35) !important;

  font-size: 12px !important;
  font-weight: 500 !important;
  letter-spacing: 0.2px;

  cursor: pointer !important;
  user-select: none !important;
  text-decoration: none !important;

  transition:
    background .15s ease,
    box-shadow .15s ease,
    transform .15s ease;
}

:where(nav, aside) .ho-seeall:hover {
  background: rgba(255,255,255,0.055) !important;
  color: rgba(255,255,255,0.9) !important;

  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.08),
    0 5px 14px rgba(0,0,0,0.45) !important;
}

nav .ho-seeall:active {
  transform: translateY(0px);
}

/* =========================================================
   8) Active states: Chat ring + Project/Folder ring
   ========================================================= */

/* ACTIVE CHAT — ring only (keeps ho-row-* colors) */
nav a.ho-has-colorbtn-side.active:not(.ho-project-row):not(.ho-seeall),
nav a[aria-current="page"]:not(.ho-project-row):not(.ho-seeall) {
  position: relative !important;
  border-radius: 10px !important;
  box-shadow:
    inset 0 0 0 1.5px rgba(255,255,255,0.22),
    0 0 0 1px rgba(0,0,0,0.55) !important;
}

/* ✅ ensure no overlay film exists */
nav a.ho-has-colorbtn-side.active:not(.ho-project-row):not(.ho-seeall)::after {
  content: none !important;
}

nav a.ho-has-colorbtn.ho-row-gold.active  { background-color: rgba(212,175,55,0.12) !important; }
nav a.ho-has-colorbtn.ho-row-red.active   { background-color: rgba(179,58,58,0.15) !important; }
nav a.ho-has-colorbtn.ho-row-blue.active  { background-color: rgba(70,100,200,0.15) !important; }
nav a.ho-has-colorbtn.ho-row-green.active { background-color: rgba(60,150,90,0.15) !important; }

/* ACTIVE PROJECT / FOLDER — Matte ring */
nav a.ho-project-row[aria-current="page"],
nav a.ho-project-row.active {
  position: relative !important;
  border-radius: 14px !important;

  box-shadow:
    inset 0 0 0 2px rgba(255,255,255,0.26),
    0 0 0 1px rgba(0,0,0,0.65),
    0 10px 24px rgba(0,0,0,0.45) !important;

  background: rgba(255,255,255,0.075) !important;
}

/* =========================================================
   9) MAIN LIST overlay ordering fixes (intentional overrides)
   ========================================================= */

.ho-main-row{
  position: relative !important;
  isolation: isolate !important;   /* stops weird blending */
}

/* push the glass layer behind everything */
.ho-main-row::before{
  z-index: -1 !important;
}

/* make sure the link content sits above */
main .ho-main-row > a{
  position: relative !important;
  z-index: 2 !important;
}

/* and the palette is always above all */
main .ho-main-row .ho-palette{
  z-index: 2147483647 !important;
  background: #000 !important;
  opacity: 1 !important;
  mix-blend-mode: normal !important;
  filter: none !important;
}

/* (second definition of .show — intentional stronger override) */
.ho-palette.show {
  display: inline-flex !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.ho-colorbtn { pointer-events: auto !important; }

/* =========================================================
   10) HO Meta actions (under title): Fix/Review line + dot
   ========================================================= */

.ho-meta-row{
  display:flex !important;
  align-items:center !important;
  justify-content: space-between !important; /* left text + right actions */
  gap: 10px !important;
    margin-top: 2px !important;
  font-size: 11px !important;
  color: rgba(255,255,255,0.45) !important;

  background: none !important;
  box-shadow: none !important;
  text-shadow: none !important;
  filter: none !important;
}

.ho-meta-lefttext{
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: 72% !important;
}

.ho-meta-actions-right{
  display:inline-flex !important;
  align-items:center !important;
  gap: 10px !important;
  transform: translateY(0px) !important;
}

.ho-meta-row, .ho-meta-actions-right { position: relative !important; z-index: 5 !important; pointer-events: auto !important; }
.ho-meta-action { pointer-events: auto !important; }

/* Buttons base (kept as-is) */
.ho-meta-action{
  font-size: 11px !important;
  font-weight: 600 !important;
  color: rgba(255,255,255,0.70) !important;
  cursor: pointer !important;
  user-select: none !important;
  padding: 2px 7px !important;
  border-radius: 8px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  background: rgba(255,255,255,0.04) !important;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}

/* ===== HO META SHAPES (Review line + Fix dot) ===== */

/* Make shape buttons ignore the base padding */
.ho-meta-action.ho-review,
.ho-meta-action.ho-fix{
  padding: 0 !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  /* hide the "Fix/Review" text but keep element clickable */
  font-size: 0 !important;
  line-height: 0 !important;
  color: transparent !important;
  overflow: hidden !important;
}

/* Review = LINE (first) */
.ho-meta-action.ho-review{
  width: 40px !important;
  height: 10px !important;
  border-radius: 999px !important;
  opacity: 0.85 !important;
}

/* Fix = DOT (second) */
.ho-meta-action.ho-fix{
  position: relative !important;
  width: 10px !important;
  height: 10px !important;
  border-radius: 999px !important;
  opacity: 0.90 !important;
}

/* inner dot (ALWAYS centered) */
.ho-meta-action.ho-fix::after{
  content: "" !important;
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;

  width: 3px !important;
  height: 3px !important;
  border-radius: 999px !important;
  background: rgba(255,255,255,0.75) !important;
}

/* when pinned (tanned), keep dot visible */
.ho-meta-action.ho-fix.is-on::after{
  background: rgba(212,175,55,0.95) !important;
}

.ho-meta-action:hover{
  background: rgba(255,255,255,0.10) !important;
  border-color: rgba(255,255,255,0.20) !important;
  transform: translateY(-0.5px) !important;
  box-shadow: 0 0 10px rgba(255,255,255,0.10) !important;
}

/* ✅ “Fix ON” = tanned dot (your pin state) */
.ho-meta-action.ho-fix.is-on{
  background: rgba(212,175,55,0.22) !important;   /* tan fill */
  border-color: rgba(212,175,55,0.35) !important; /* tan edge */
  box-shadow: 0 0 12px rgba(212,175,55,0.18) !important;
  opacity: 1 !important;
}

.ho-meta-action.is-on{
  background: rgba(255,255,255,0.14) !important;
  border-color: rgba(255,255,255,0.22) !important;
  color: rgba(255,255,255,0.98) !important;
}

/* ✅ MAIN LIST: hide extra snippet lines without JS (prevents refresh-jump) */
main .ho-snip-hidden > :not(:first-child):not(.ho-meta-row){
  display: none !important;
}

html.ho-meta-boot main .ho-main-row{ opacity: 0 !important; visibility: hidden !important; }
html:not(.ho-meta-boot) main .ho-main-row{
  opacity: 1 !important;
  transition: opacity .14s ease !important;
}


/* =========================================================
   12) Preview tooltip (used by Review hover)
   ========================================================= */

#ho-preview-tip{
  position: fixed !important;
  z-index: 2147483647 !important;
  background: #000 !important;
  border: 1px solid rgba(255,255,255,0.14) !important;
  border-radius: 10px !important;
  padding: 10px 12px !important;
  box-shadow: 0 12px 30px rgba(0,0,0,0.85) !important;

  color: rgba(255,255,255,0.92) !important;
  font-size: 12px !important;
  max-width: 320px !important;
  display: none !important;

  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  filter: none !important;
  isolation: isolate !important;
}
#ho-preview-tip.show{ display:block !important; }
#ho-preview-tip .t{ font-weight: 600 !important; margin-bottom: 6px !important; }
#ho-preview-tip .m{ color: rgba(255,255,255,0.70) !important; }

`;
document.head.appendChild(style);

  // ---- utils ----
  const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
  const once = (fn, ms=50) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

    /* =========================
   ✅ Block A) Anti-flicker lock + scheduled sort
   Paste near your utils (after qsa/once)
   ========================= */
let HO_INTERNAL_MUT = 0;
function hoWithLock(fn){
  HO_INTERNAL_MUT++;
  try { return fn(); } finally { HO_INTERNAL_MUT--; }
}
function hoLocked(){ return HO_INTERNAL_MUT > 0; }

let hoPinSortRAF = 0;
let hoPinSortTO  = 0;

function scheduleSortMainPins(){
  cancelAnimationFrame(hoPinSortRAF);
  clearTimeout(hoPinSortTO);

  const runSort = () => {
    const sorter =
      (typeof window.sortMainListByPins === "function") ? window.sortMainListByPins :
      (typeof sortMainListByPins === "function") ? sortMainListByPins : null;
    if (!sorter) return;
    hoWithLock(() => sorter());
  };

  hoPinSortRAF = requestAnimationFrame(runSort);
}


       //=========================

function getChatIdFromHref(href) {
  if (!href) return null;

  // accept absolute or relative
  // supports: /c/ID , https://chatgpt.com/c/ID , /chat/ID (some UIs)
  const m =
    href.match(/\/c\/([^/?#]+)/) ||
    href.match(/\/chat\/([^/?#]+)/);

  return m ? m[1] : null;
}


function updateLastSeenForCurrentChat() {
  const curId = (location.pathname.match(/\/c\/([^\/?#]+)/) || [])[1];
  if (curId) touchChatLastSeen(curId);
}


/* ─────────────────────────────────────────
   1) Active chat pill ring (sidebar) + lastseen touch
   ───────────────────────────────────────── */

function markActiveSidebarLink() {
  const curId = (location.pathname.match(/\/c\/([^\/?#]+)/) || [])[1];
  document.querySelectorAll("nav a").forEach(a => {
    const id = getChatIdFromHref(a.getAttribute("href") || "");
    a.classList.toggle("active", !!curId && !!id && id === curId);
  });
}

markActiveSidebarLink();
updateLastSeenForCurrentChat();

(function hookHistory() {
  const _push = history.pushState;
  const _rep  = history.replaceState;

  history.pushState = function(...args){
    const r = _push.apply(this, args);
    markActiveSidebarLink();
    updateLastSeenForCurrentChat();
    window.dispatchEvent(new Event("ho:navigate"));
    return r;
  };

  history.replaceState = function(...args){
    const r = _rep.apply(this, args);
    markActiveSidebarLink();
    updateLastSeenForCurrentChat();
    window.dispatchEvent(new Event("ho:navigate"));
    return r;
  };

  window.addEventListener("popstate", () => {
    markActiveSidebarLink();
    updateLastSeenForCurrentChat();
    window.dispatchEvent(new Event("ho:navigate"));
  });
})();

// ✅ project/folder clicks often DON'T trigger pushState/replaceState
(function hoProjectNavHook(){
  if (window.__hoProjectNavHook) return;
  window.__hoProjectNavHook = true;

  function hoFireNavigate(){
    window.dispatchEvent(new Event("ho:navigate"));
  }

  document.addEventListener("click", (e) => {
    const a = e.target instanceof HTMLElement
      ? e.target.closest('nav a.ho-project-row, nav .ho-seeall')
      : null;
    if (!a) return;

    setTimeout(hoFireNavigate, 80);
  }, true);
})();



  /* ─────────────────────────────────────────
     2) Apply styles from saved indexes (dot + row)
     ───────────────────────────────────────── */

function applyDotByIndex(btn, idx) {
  const isSide = btn.classList.contains('ho-colorbtn-side');
  const isMain = btn.classList.contains('ho-colorbtn-main');

  // no color selected yet → default behavior
  if (idx < 0 || idx >= COLORS.length) {
    if (isSide) {
      // default gray bar in sidebar
      //btn.style.backgroundColor = 'rgba(190,195,205,0.55)';   // bar fill
        btn.style.backgroundColor = "transparent";
      btn.style.borderColor     = 'rgba(220,225,235,0.9)';    // silver edge
    } else if (isMain) {
      // keep project/folder bar empty-transparent when no color
      btn.style.backgroundColor = 'rgba(190,195,205,0.55)';
      btn.style.borderColor     = 'rgba(220,225,235,0.9)';

    }
    return;
  }

  // real color selected
  const color = COLORS[idx].value;
  btn.style.backgroundColor = color;
  btn.style.borderColor     = 'rgba(255,255,255,0.25)';
}


function applyRowByIndex(link, idx) {
  // In project list: use the row container.
  // In sidebar: link itself (no .ho-main-row above).
  const rowEl = link.closest(".ho-main-row") || link;

  // clear old colors from both container and link
  [rowEl, link].forEach(el => {
    el.classList.remove("ho-row-gold","ho-row-red","ho-row-blue","ho-row-green");
  });

  if (idx < 0 || idx >= COLORS.length) return;
  const def = COLORS[idx];
  const cls = "ho-row-" + def.name;
  rowEl.classList.add(cls);
}

    function touchChatLastSeen(chatId) {
  if (!chatId) return;
  localStorage.setItem(LASTSEEN_KEY(chatId), String(Date.now()));
}



  /* ─────────────────────────────────────────
     3) Layout helpers (visibility + sidebar state)
     ───────────────────────────────────────── */

function isElementVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function isSidebarOpen() {
  const main = document.querySelector('main');
  if (!main) return false;

  const rect = main.getBoundingClientRect();
  const offset = rect.left;   // distance from left edge of viewport

  // 👉 tweak this value if needed:
  // - With sidebar open, offset is usually ~260px
  // - With sidebar hidden, offset is usually < 40px
  return offset > 120;
}

  /* ─────────────────────────────────────────
     4) Palette toggle logic
     ───────────────────────────────────────── */

function getPaletteForBtn(btn) {
  const id = btn?.dataset?.chatid;
  if (!id) return null;

  // 1) Always prefer palette inside the SAME anchor as the button
  const parentLink = btn.closest("a[href]");
  if (parentLink) {
    const p = parentLink.querySelector(`:scope > .ho-palette[data-chatid="${id}"]`);
    if (p) return p;
  }

  // 2) Fallback: any open/portaled palette for this id (rare)
  return document.querySelector(`.ho-palette.ho-floating[data-chatid="${id}"]`);
}

function getBtnForChatId(chatId, scopeEl) {
  return (
    // ✅ best: button inside same anchor as the palette (prevents cross-list mismatch)
    (scopeEl?.closest("a[href]")?.querySelector(`.ho-colorbtn[data-chatid="${chatId}"]`)) ||

    // ✅ prefer sidebar/main explicitly if needed
    document.querySelector(`nav .ho-colorbtn[data-chatid="${chatId}"]`) ||
    document.querySelector(`main .ho-colorbtn[data-chatid="${chatId}"]`) ||

    // ✅ fallback
    document.querySelector(`.ho-colorbtn[data-chatid="${chatId}"]`)
  );
}



function getLinkForChatId(chatId) {
  return document.querySelector(`a[href*="/c/${chatId}"]`);
}


function openMainPalettePortal(palette, btn, parentLink) {
  if (!palette.__hoHome) palette.__hoHome = parentLink;

  // ✅ remember + remove the inline-positioning class that breaks the portaled layout
  if (!palette.__hoPosClass) {
    palette.__hoPosClass =
      palette.classList.contains("ho-palette-sidebar") ? "ho-palette-sidebar" :
      palette.classList.contains("ho-palette-main-right") ? "ho-palette-main-right" :
      palette.classList.contains("ho-palette-main") ? "ho-palette-main" : "";
  }
  palette.classList.remove("ho-palette-sidebar","ho-palette-main","ho-palette-main-right");

  palette.classList.add("ho-floating", "show");
  document.body.appendChild(palette);

  // ✅ kill any leftover geometry constraints from old class rules
  palette.style.right = "auto";
  palette.style.bottom = "auto";
  palette.style.marginRight = "0";
  palette.style.marginLeft = "0";

  // wipe any old inline constraints
  palette.style.left = "";
  palette.style.top = "";
  palette.style.transform = "";

  const r = btn.getBoundingClientRect();

  palette.style.position = "fixed";
  //palette.style.left = `${Math.round(r.right + 10)}px`;
  //palette.style.top  = `${Math.round(r.top + r.height / 2)}px`;

    const isSide = btn.classList.contains("ho-colorbtn-side");

palette.style.left = `${Math.round(isSide ? (r.left - 10) : (r.right + 10))}px`;
palette.style.top  = `${Math.round(r.top + r.height / 2)}px`;
palette.style.transform = "translateY(-50%)";


  palette.style.transform = "translateY(-50%)";

  requestAnimationFrame(() => {
    const pr = palette.getBoundingClientRect();

    let left = Math.round(r.right + 10);
    if (left + pr.width > window.innerWidth - 8) left = Math.round(r.left - 10 - pr.width);
    if (left < 8) left = 8;

    const minTop = 8 + pr.height / 2;
    const maxTop = window.innerHeight - 8 - pr.height / 2;
    let top = Math.round(r.top + r.height / 2);
    top = Math.min(Math.max(top, minTop), maxTop);

    palette.style.left = `${left}px`;
    palette.style.top  = `${top}px`;
  });
}

function closePalette(palette) {
  if (!palette) return;

  palette.classList.remove("show", "ho-floating");

  // ✅ restore original positioning class (so sidebar/main inline layout still works)
  if (palette.__hoPosClass) palette.classList.add(palette.__hoPosClass);

  palette.style.position = "";
  palette.style.left = "";
  palette.style.top = "";
  palette.style.right = "";
  palette.style.bottom = "";
  palette.style.marginRight = "";
  palette.style.marginLeft = "";
  palette.style.transform = "";

  const home = palette.__hoHome;
  if (home && home.isConnected) home.appendChild(palette);
}


function setRowOverflowForPalette(btn, on) {
  const a = btn.closest("a[href]");
  const row = a?.closest(".ho-main-row");
  if (!row) return;

  if (on) {
    if (row.__hoPrevOverflow == null) row.__hoPrevOverflow = row.style.overflow || "";
    row.style.overflow = "visible";
  } else {
    row.style.overflow = row.__hoPrevOverflow || "";
    row.__hoPrevOverflow = null;
  }
}

let hoOpenPalette = null;

function closeAllPalettes() {
  document.querySelectorAll(".ho-palette.show").forEach(p => closePalette(p));
  hoOpenPalette = null;
}


function togglePaletteForButton(btn) {
  const parentLink = btn.closest("a[href]");
  if (!parentLink) return;

  const palBefore = getPaletteForBtn(btn) || parentLink.querySelector(".ho-palette");
  const wasOpen = !!palBefore && palBefore.classList.contains("show");

  closeAllPalettes();

  if (wasOpen) {
    setRowOverflowForPalette(btn, false);
    hoOpenPalette = null;
    return;
  }

  const palette = getPaletteForBtn(btn) || parentLink.querySelector(".ho-palette");
  if (!palette) return;

  palette.__hoOwnerBtn = btn;

  // ✅ ALWAYS portal (sidebar + main)
  setRowOverflowForPalette(btn, true);   // harmless for sidebar; helps main
  openMainPalettePortal(palette, btn, parentLink);

  hoOpenPalette = palette;
}


    /* ─────────────────────────────────────────
     5) Decorate chat links (add button + palette + restore saved row)
     ───────────────────────────────────────── */

 // ---- decorate links ----
function decorateLink(link) {
  if (!(link instanceof HTMLAnchorElement)) return;

  // normalize text (handles “… See more” and "... See more")
  const text = (link.textContent || "")
    .trim()
    .toLowerCase()
    .replace(/^[.…]+(\s+)?/, "");

  // ✅ "See All / See more" control row
  if (text === "see all" || text === "see more") {
    link.classList.add("ho-seeall");
    link.classList.remove("ho-project-row"); // safety
    return;
  }

  // only chat links
  const id = getChatIdFromHref(link.getAttribute("href"));
  if (!id) return;

  // ✅ already decorated → refresh HEAT and exit (important for rescans)
  if (link.classList.contains("ho-has-colorbtn-side") || link.classList.contains("ho-has-colorbtn-main")) {
    const btn = link.querySelector(".ho-colorbtn");

    // ✅ palette may be portaled (floating in body) while open
    const palInline = link.querySelector(".ho-palette");
    const palFloating = document.querySelector(`.ho-palette.ho-floating[data-chatid="${id}"]`);

    if (btn && (palInline || palFloating)) {
      applyHeatToBtn(btn, id);
      return;
    }
    // if missing pieces, fall through and re-decorate
  }

  const isSidebar = !!link.closest("nav, aside") && !link.closest("main");

  link.classList.add("ho-has-colorbtn");
  link.classList.add(isSidebar ? "ho-has-colorbtn-side" : "ho-has-colorbtn-main");

  // project list wrapper
  if (!isSidebar && link.parentElement) {
    link.parentElement.classList.add("ho-main-row");
  }

  // --- create left pill button ---
  const btn = document.createElement("span");
  btn.className = isSidebar
    ? "ho-colorbtn ho-colorbtn-side"
    : "ho-colorbtn ho-colorbtn-main";

  btn.dataset.chatid = id;

  // make it behave like a button
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;

  btn.style.pointerEvents = "auto";
btn.style.zIndex = isSidebar ? "2" : "999999";


    // ✅ BLOCK navigation that triggers on pointerdown/mousedown (before click)
["pointerdown", "mousedown"].forEach(evt => {
  btn.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);
});


  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    console.log("[HO] pill clicked", btn.dataset.chatid);

    togglePaletteForButton(btn);
  }, true);

  // 🔥 apply heat visuals first (auto + override)
  applyHeatToBtn(btn, id);

  // restore DOT color state (still supported)
  const dotStored = localStorage.getItem(DOT_KEY(id));
  const dotIdx = dotStored !== null ? parseInt(dotStored, 10) : -1;
  applyDotByIndex(btn, dotIdx);

  // --- palette container ---
  const palette = document.createElement("div");
  palette.className = "ho-palette " + (isSidebar ? "ho-palette-sidebar" : "ho-palette-main");

  palette.dataset.chatid = id;

  // --- row 1: DOT colors ---
  const rowDots = document.createElement("div");
  rowDots.className = "ho-palette-row";
  COLORS.forEach((c, idx) => {
    const sw = document.createElement("div");
    sw.className = "ho-swatch dot";
    sw.style.backgroundColor = c.value;
    sw.title = `Dot: ${c.name}`;
    sw.dataset.mode = "dot";
    sw.dataset.idx = String(idx);
    rowDots.appendChild(sw);
  });

  // --- row 2: HEAT override (AUTO/H/W/C/OFF) ---
  const heatRow = document.createElement("div");
  heatRow.className = "ho-palette-row";
  ["auto","hot","warm","cold","off"].forEach(level => {
    const sw = document.createElement("div");
    sw.className = "ho-swatch heat";

    sw.textContent = level[0].toUpperCase(); // A H W C O
    sw.title = `Heat: ${level}`;
    sw.dataset.mode = "heat";
    sw.dataset.level = level;
    heatRow.appendChild(sw);
  });

  // --- row 3: ROW background colors ---
  const rowRows = document.createElement("div");
  rowRows.className = "ho-palette-row";
  COLORS.forEach((c, idx) => {
    const sw = document.createElement("div");
    sw.className = "ho-swatch row";
    sw.style.backgroundColor = c.value.replace(/,1\)/, ",0.5)");
    sw.title = `Row: ${c.name}`;
    sw.dataset.mode = "row";
    sw.dataset.idx = String(idx);
    rowRows.appendChild(sw);
  });

  // append rows in order
  palette.appendChild(rowDots);
  palette.appendChild(rowRows);
  palette.appendChild(heatRow);

link.appendChild(btn);
link.appendChild(palette);

  // restore ROW highlight state
  const rowStored = localStorage.getItem(ROW_KEY(id));
  const rowIdx = rowStored !== null ? parseInt(rowStored, 10) : -1;
  if (rowIdx >= 0) applyRowByIndex(link, rowIdx);
}


  /* ─────────────────────────────────────────
     6) Sidebar "Projects" tagging + "See all/more" controls
     ───────────────────────────────────────── */

function normSeeText(el) {
  const t = (el && el.textContent) ? el.textContent : "";
  return t.trim().toLowerCase().replace(/^[.…]+(\s+)?/, "");
}


function findClickablePillTarget(el) {
  let cur = el;
  for (let i = 0; i < 6 && cur; i++) {
    if (
      cur.tagName === "A" ||
      cur.tagName === "BUTTON" ||
      cur.getAttribute?.("role") === "button" ||
      cur.hasAttribute?.("tabindex")
    ) return cur;
    cur = cur.parentElement;
  }
  return el; // fallback
}

function markSidebarProjects() {
  const nav = document.querySelector("nav");
  if (!nav) return;

  // clear previous project tags (any element type)
  nav.querySelectorAll(".ho-project-row").forEach(el => el.classList.remove("ho-project-row"));

  // find "Projects" header (case-insensitive)
  const projectsHeader = [...nav.querySelectorAll("*")]
    .find(el => ((el.textContent || "").trim().toLowerCase() === "projects"));

  if (!projectsHeader) return;

  let started = false;
  const walker = document.createTreeWalker(nav, NodeFilter.SHOW_ELEMENT, null);

  while (walker.nextNode()) {
    const el = walker.currentNode;
    const txt = ((el.textContent || "").trim().toLowerCase());

    if (el === projectsHeader) { started = true; continue; }
    if (!started) continue;

    // stop when we hit the next section
    if (txt === "your chats") break;

    // normalize label (handles "... See more" and "… See more")
    const label = txt.replace(/^[.…]+(\s+)?/, "");

    // skip controls (they're handled by markSeeControls)
    if (label === "see all" || label === "see more") continue;

    // find the real clickable container (A / BUTTON / role=button / tabindex)
    const pill = findClickablePillTarget(el);
    if (!pill) continue;

    // skip chat rows
    const href = pill.getAttribute?.("href") || "";
    if (href.includes("/c/")) continue;

    // avoid tagging random wrappers; only tag things that look clickable
    const role = pill.getAttribute?.("role");
    const isClickable =
      pill.tagName === "A" ||
      pill.tagName === "BUTTON" ||
      role === "button" ||
      pill.hasAttribute?.("tabindex");

    if (!isClickable) continue;

    pill.classList.add("ho-project-row");
  }
}




function markSeeControls() {
  const nav = document.querySelector("nav");
  if (!nav) return;

  const candidates = [...nav.querySelectorAll("a,button,div,span")];

  candidates.forEach(el => {
    const t = normSeeText(el);
    if (t === "see all" || t === "see more") {
      const pill = findClickablePillTarget(el);
      pill.classList.add("ho-seeall");
      pill.classList.remove("ho-project-row");
      pill.parentElement?.classList.remove("ho-project-row");
    }
  });
}


  /* ─────────────────────────────────────────
     7) Full scan pass (decorate + mark projects + controls + active ring)
     ───────────────────────────────────────── */

function scanSidebar() {
      if (hoLocked()) return;
  const paletteOpen = hoOpenPalette && hoOpenPalette.classList.contains("show");

  // Grab ALL anchors from sidebar-ish + main list
  const allA = [
    ...document.querySelectorAll('nav a[href], aside a[href], main a[href]')
  ];

  const links = allA.filter(a => {
    const href = a.getAttribute("href") || "";
    return /\/(c|chat)\//.test(href);
  });

  // ✅ DON’T redecorate while palette is open (prevents “palette eaten” bug)
  if (!paletteOpen) {
    links.forEach(decorateLink);
  }

  // heat can still update safely
  document.querySelectorAll("a.ho-has-colorbtn").forEach(a => {
    const id = getChatIdFromHref(a.getAttribute("href") || "");
    const btn = a.querySelector(".ho-colorbtn");
    if (id && btn) applyHeatToBtn(btn, id);
  });

  if (!paletteOpen) {
    markSidebarProjects();
    markSeeControls();
    markActiveSidebarLink();
  }
}

scanSidebar();


// ✅ FORCE rescans because ChatGPT lists are virtualized / lazy-rendered
let hoForceTick = 0;

setInterval(() => {
  if (hoOpenPalette && hoOpenPalette.classList.contains("show")) return;
  scanSidebar();
}, 1200);


requestAnimationFrame(scanSidebar);
setTimeout(scanSidebar, 600);
setTimeout(scanSidebar, 1500);



  /* ─────────────────────────────────────────
     8) Click handling: button toggle + swatches + close-outside
     ───────────────────────────────────────── */

 // ---- click handling ----
document.addEventListener("click", e => {
  const target = e.target;
/*
  // 1) left-click on color button: toggle its palette, do NOT navigate
  if (target instanceof HTMLElement && target.classList.contains("ho-colorbtn")) {
    e.preventDefault();
    e.stopPropagation();
    togglePaletteForButton(target);
    return;
  }
*/

// 2) click on color swatch in the palette
if (target instanceof HTMLElement && target.classList.contains("ho-swatch")) {
  e.preventDefault();
  e.stopPropagation();

  const mode = target.dataset.mode || "dot";
  const pal = target.closest(".ho-palette");
  const id = pal?.dataset?.chatid;
  if (!id) return;

const btn = getBtnForChatId(id, pal);

  if (!btn) return;


const parentLink = btn.closest("a[href]") || pal.__hoHome || getLinkForChatId(id);
if (!parentLink) return;


  if (mode === "heat") {
    const level = target.dataset.level || "auto";
    if (level === "auto") localStorage.removeItem(OVERRIDE_KEY(id));
    else localStorage.setItem(OVERRIDE_KEY(id), level);
    applyHeatToBtn(btn, id);
  } else {
    const idx = parseInt(target.dataset.idx || "0", 10);

    if (mode === "dot") {
      const stored = localStorage.getItem(DOT_KEY(id));
      const current = stored !== null ? parseInt(stored, 10) : -1;

      if (current === idx) {
        applyDotByIndex(btn, -1);
        localStorage.removeItem(DOT_KEY(id));
      } else {
        applyDotByIndex(btn, idx);
        localStorage.setItem(DOT_KEY(id), String(idx));
      }
    } else if (mode === "row") {
      const stored = localStorage.getItem(ROW_KEY(id));
      const current = stored !== null ? parseInt(stored, 10) : -1;

      if (current === idx) {
        applyRowByIndex(parentLink, -1);
        localStorage.removeItem(ROW_KEY(id));
      } else {
        applyRowByIndex(parentLink, idx);
        localStorage.setItem(ROW_KEY(id), String(idx));
      }
    }
  }

if (pal) closePalette(pal);

  return;
}

// ✅ if clicking inside palette, do nothing (don't close)
if (target instanceof HTMLElement && target.closest(".ho-palette")) {
  return;
}


  // 3) click elsewhere → close palettes
// 3) click elsewhere -> close (BUT not if clicking palette or button)
// close if click is NOT inside palette and NOT on the pill button (or its children)
if (target instanceof HTMLElement) {
  const insidePalette = !!target.closest(".ho-palette");
const isBtn = !!target.closest(".ho-colorbtn");


  if (!insidePalette && !isBtn) {
    document.querySelectorAll(".ho-palette.show").forEach(p => closePalette(p));
    hoOpenPalette = null;
  }
}


}, false);

// ✅ middle-click handler defined once, globally
document.addEventListener("auxclick", e => {
  if (e.button !== 1) return;
  const btn = e.target instanceof HTMLElement ? e.target.closest(".ho-colorbtn") : null;
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();
  togglePaletteForButton(btn);
}, true);




  /* ─────────────────────────────────────────
     9) Observe DOM changes + initial scan
     ───────────────────────────────────────── */

  // ---- observe DOM ----
  const rescan = once(scanSidebar, 50);
  const mo = new MutationObserver(rescan);
  mo.observe(document.body, { childList: true, subtree: true });

  scanSidebar();


/* ─────────────────────────────────────────────────────────
   10) Meta Line Module v2: created date + answer count + Fix/Review + Pin sort
   ───────────────────────────────────────────────────────── */

(function hoChatMetaModuleV2() {
  'use strict';

  const META_KEY = "ho:chat-meta-v1";
  const PIN_KEY  = id => `ho:chat-pin:${id}`;

  // --------------------------
  // store helpers
  // --------------------------
  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
  }

  function isPinned(chatId){
    try { return localStorage.getItem(PIN_KEY(chatId)) === "1"; }
    catch { return false; }
  }
  function setPinned(chatId, on){
    try {
      if (on) localStorage.setItem(PIN_KEY(chatId), "1");
      else localStorage.removeItem(PIN_KEY(chatId));
    } catch {}
  }

  // --------------------------
  // chat info
  // --------------------------
  function getCurrentChatIdFromLocation() {
    const m = location.pathname.match(/\/c\/([^\/?#]+)/);
    return m ? m[1] : null;
  }

  function countAssistantAnswers() {
    return document.querySelectorAll('[data-message-author-role="assistant"]').length;
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleString(undefined, { month: "short" });
    const yy = d.getFullYear();
    return `${dd} ${mon} ${yy}`;
  }

  // 🔍 Read actual creation time from React fiber (same idea as timestamp script)
  function getFirstMessageCreateTimeMs() {
    const firstAssistant = document.querySelector('div[data-message-author-role="assistant"]');
    if (!firstAssistant) return null;

    const reactKey = Object.keys(firstAssistant).find(k => k.startsWith("__reactFiber$"));
    if (!reactKey) return null;

    const fiber = firstAssistant[reactKey];
    const messages = fiber?.return?.memoizedProps?.messages;
    const tsSec = messages?.[0]?.create_time;
    if (!tsSec) return null;

    return tsSec * 1000;
  }

    // --------------------------
// snapshot helpers (DOM text) ✅
// --------------------------
function escapeHtml(s=""){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function normText(s=""){
  return String(s)
    .replace(/\s+/g, " ")
    .trim();
}

function trunc(s="", n=260){
  const t = normText(s);
  return t.length > n ? (t.slice(0, n-1) + "…") : t;
}

function extractMessageText(el){
  if (!el) return "";
  // Try to avoid copying button labels etc; innerText is OK here.
  return normText(el.innerText || el.textContent || "");
}

function getFirstLastSnapshots(){
  const users = [...document.querySelectorAll('div[data-message-author-role="user"]')];
  const assts = [...document.querySelectorAll('div[data-message-author-role="assistant"]')];

  const firstQ = extractMessageText(users[0]);
  const firstA = extractMessageText(assts[0]);

  const lastQ  = extractMessageText(users[users.length - 1]);
  const lastA  = extractMessageText(assts[assts.length - 1]);

  return {
    firstQ: trunc(firstQ, 320),
    firstA: trunc(firstA, 360),
    lastQ:  trunc(lastQ,  320),
    lastA:  trunc(lastA,  360),
  };
}


  // --------------------------
  // update meta while inside chat
  // --------------------------
function updateMetaFromOpenChat() {
  const chatId = getCurrentChatIdFromLocation();
  if (!chatId) return;

  const meta = loadMeta();
  const now = Date.now();
  const answers = countAssistantAnswers();
  const tsMs = getFirstMessageCreateTimeMs();

  const createdAt = tsMs ?? meta[chatId]?.createdAt ?? now;

  // ✅ NEW: first/last Q/A snapshots (from open chat DOM)
  const snaps = getFirstLastSnapshots();

  if (!meta[chatId]) {
    meta[chatId] = {
      createdAt,
      answers,
      updatedAt: now,

      // ✅ store snapshots
      firstQ: snaps.firstQ,
      firstA: snaps.firstA,
      lastQ:  snaps.lastQ,
      lastA:  snaps.lastA,
    };
  } else {
    meta[chatId].answers = answers;
    meta[chatId].updatedAt = now;

    // if we discover a better earlier timestamp, replace
    if (!meta[chatId].createdAt || (tsMs && tsMs < meta[chatId].createdAt)) {
      meta[chatId].createdAt = createdAt;
    }

    // ✅ update snapshots too (keeps them fresh)
    meta[chatId].firstQ = snaps.firstQ || meta[chatId].firstQ || "";
    meta[chatId].firstA = snaps.firstA || meta[chatId].firstA || "";
    meta[chatId].lastQ  = snaps.lastQ  || meta[chatId].lastQ  || "";
    meta[chatId].lastA  = snaps.lastA  || meta[chatId].lastA  || "";
  }

  saveMeta(meta);
}


  // --------------------------
  // preview tooltip (single global)
  // --------------------------
  function getPreviewTip(){
    let tip = document.getElementById("ho-preview-tip");
    if (!tip){
      tip = document.createElement("div");
      tip.id = "ho-preview-tip";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showPreviewTip(anchorEl, html){
    const tip = getPreviewTip();
    tip.innerHTML = html;
    tip.classList.add("show");

    const r = anchorEl.getBoundingClientRect();
    let left = Math.round(r.right + 10);
    let top  = Math.round(r.top + r.height / 2);

    requestAnimationFrame(() => {
      const tr = tip.getBoundingClientRect();
      if (left + tr.width > window.innerWidth - 8) left = Math.max(8, Math.round(r.left - 10 - tr.width));
      const minTop = 8 + tr.height/2;
      const maxTop = window.innerHeight - 8 - tr.height/2;
      top = Math.min(Math.max(top, minTop), maxTop);

      tip.style.left = left + "px";
      tip.style.top  = top + "px";
      tip.style.transform = "translateY(-50%)";
    });
  }

  function hidePreviewTip(){
    const tip = document.getElementById("ho-preview-tip");
    if (tip) tip.classList.remove("show");
  }

  // --------------------------
  // ✅ SORT: pinned rows first (MAIN)
  // requires your scheduleSortMainPins() + hoWithLock() + hoLocked() to exist
  // --------------------------
  function sortMainListByPins(){
    const rows = [...document.querySelectorAll("main .ho-main-row")];
    if (!rows.length) return;

    const groups = new Map();
    for (const row of rows){
      const parent = row.parentElement;
      if (!parent) continue;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(row);
    }

    for (const [parent, list] of groups.entries()){
      const items = list.map(row => {
        const a = row.querySelector('a[href*="/c/"]');
        const idm = (a?.getAttribute("href") || "").match(/\/c\/([^\/?#]+)/);
        const id = idm ? idm[1] : null;
        return { row, id };
      }).filter(x => !!x.id);

      const pinned = items.filter(x => isPinned(x.id));
      if (!pinned.length) continue;

      const normal = items.filter(x => !isPinned(x.id));
      const desired = [...pinned, ...normal].map(x => x.row);

      // idempotent check
      let same = true;
      for (let i=0; i<desired.length; i++){
        if (parent.children[i] !== desired[i]) { same = false; break; }
      }
      if (same) continue;

      const frag = document.createDocumentFragment();
      desired.forEach(r => frag.appendChild(r));
      parent.appendChild(frag);
    }
  }

  // 🔥 IMPORTANT: connect your existing scheduler to this sorter
  // If your scheduleSortMainPins() already calls sortMainListByPins() from outer scope,
  // you can delete this bridging line.
  window.sortMainListByPins = sortMainListByPins;


// --------------------------
// render meta row under title in MAIN list
// --------------------------
function renderMetaInProjectList() {
  const meta = loadMeta();
  const links = document.querySelectorAll('main a[href*="/c/"]');

  let sawPinned = false;

  links.forEach(link => {
    const href = link.getAttribute("href") || "";
    const m = href.match(/\/c\/([^\/?#]+)/);
    if (!m) return;

    const chatId = m[1];
    const data = meta[chatId];

// structure guards (stable + anti-duplication)
const wrapper = link.querySelector(':scope > div') || link.firstElementChild;
if (!wrapper) return;

// left column: first direct div inside wrapper (fallback wrapper)
const leftCol =
  wrapper.querySelector(':scope > div') ||
  wrapper.firstElementChild ||
  wrapper;
if (!leftCol) return;

// ✅ dedupe: if multiple meta rows exist, keep only the first
const metas = [...leftCol.querySelectorAll(':scope > .ho-meta-row')];
if (metas.length > 1) metas.slice(1).forEach(m => m.remove());

// title row: first direct child that is NOT metaRow
const titleRow =
  [...leftCol.children].find(el => el instanceof HTMLElement && !el.classList.contains("ho-meta-row")) ||
  leftCol;


    // ✅ Ensure row wrapper exists for sorting
    const rowWrap = link.closest(".ho-main-row") || link.parentElement;
    if (rowWrap) rowWrap.classList.add("ho-main-row");

// ✅ Ensure metaRow exists (strict direct child)
let metaRow = leftCol.querySelector(':scope > .ho-meta-row');

    if (!metaRow) {
      metaRow = document.createElement("div");
      metaRow.className = "ho-meta-row";
      titleRow.insertAdjacentElement("afterend", metaRow);
    }

/*
    // ✅ Hide snippet lines once
    if (!leftCol.__hoSnipHidden) {
      [...leftCol.children].forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        if (el === titleRow || el === metaRow) el.style.display = "";
        else el.style.display = "none";
      });
      leftCol.__hoSnipHidden = true;
    }
*/

// ✅ Hide snippet lines via CSS class (no delayed inline display writes)
if (!leftCol.classList.contains("ho-snip-hidden")) {
  leftCol.classList.add("ho-snip-hidden");
}


    // no meta yet -> hide row
 const safe = data || {};
const dateStr = safe.createdAt ? formatDate(safe.createdAt) : "—";
const answersStr = (safe.answers ?? null) !== null ? String(safe.answers) : "—";

const leftText = (dateStr !== "—" || answersStr !== "—")
  ? `${dateStr} · ${answersStr} answers`
  : `Open once · — answers`;

    const pinned = isPinned(chatId);
    if (pinned) sawPinned = true;

    if (rowWrap) rowWrap.classList.toggle("ho-pinned-row", pinned);

    // ✅ SELF-HEAL: ensure the actions exist (Fix/Review never missing)
    const hasActions = !!metaRow.querySelector(".ho-meta-actions-right");
    if (!hasActions) {
metaRow.innerHTML = `
  <div class="ho-meta-lefttext"></div>
  <div class="ho-meta-actions-right">
    <span class="ho-meta-action ho-review" title="Preview" aria-label="Review" role="button" tabindex="0"></span>
    <span class="ho-meta-action ho-fix" title="Pin to top" aria-label="Fix" role="button" tabindex="0"></span>
  </div>
`;

    }

    // update left text every time
    const leftTextEl = metaRow.querySelector(".ho-meta-lefttext");
    if (leftTextEl && leftTextEl.textContent !== leftText) {
      leftTextEl.textContent = leftText;
    }

    // pinned “tanned”
    const fixBtn = metaRow.querySelector(".ho-fix");
    if (fixBtn) fixBtn.classList.toggle("is-on", pinned);

    // ✅ Wire events once per metaRow node (no double listeners)
    if (!metaRow.__hoWired) {
      metaRow.__hoWired = true;

      const revBtn = metaRow.querySelector(".ho-review");

      // prevent parent <a> stealing press
      [fixBtn, revBtn].forEach(b => {
        if (!b) return;
        ["pointerdown", "mousedown"].forEach(evt => {
          b.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
          }, true);
        });
      });

      // Fix click => pin toggle + sort
      fixBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const nowPinned = !isPinned(chatId);
        setPinned(chatId, nowPinned);

        if (rowWrap) rowWrap.classList.toggle("ho-pinned-row", nowPinned);
        fixBtn.classList.toggle("is-on", nowPinned);

        console.log("[HO] pinned now:", chatId, nowPinned);

        // ✅ stable re-sort

        try { scanSidebar(); } catch {}
      }, true);

      // Review hover tooltip
      revBtn?.addEventListener("mouseenter", () => {
        const titleText = (titleRow?.textContent || link.textContent || "")
          .trim().split("\n")[0].trim() || "Chat";

        const lastSeen = (typeof getLastActivityTs === "function")
          ? getLastActivityTs(chatId)
          : null;

        const heat = (typeof getHeatLevel === "function")
          ? getHeatLevel(chatId)
          : "—";

          const mq = safe.firstQ || "";
const ma = safe.firstA || "";
const lq = safe.lastQ  || "";
const la = safe.lastA  || "";

const firstBlock = (mq || ma)
  ? `<div class="m"><b>📍 First</b></div>
     <div class="m"><b>Q:</b> ${escapeHtml(mq || "—")}</div>
     <div class="m"><b>A:</b> ${escapeHtml(ma || "—")}</div>`
  : `<div class="m"><b>📍 First</b> — <i>Open chat once to cache</i></div>`;

const lastBlock = (lq || la)
  ? `<div class="m"><b>🕒 Last</b></div>
     <div class="m"><b>Q:</b> ${escapeHtml(lq || "—")}</div>
     <div class="m"><b>A:</b> ${escapeHtml(la || "—")}</div>`
  : `<div class="m"><b>🕒 Last</b> — <i>Open chat once to cache</i></div>`;


const html = `
  <div class="t">${escapeHtml(titleText)}</div>

  <div class="m">Heat: <b>${escapeHtml(heat)}</b></div>
  <div class="m">Pinned: <b>${isPinned(chatId) ? "Yes" : "No"}</b></div>
  <div class="m">Created: <b>${escapeHtml(dateStr || "—")}</b></div>
  <div class="m">Answers: <b>${escapeHtml(answersStr)}</b></div>
  <div class="m">Last seen: <b>${lastSeen ? escapeHtml(formatDate(lastSeen)) : "—"}</b></div>

  <div style="height:8px"></div>
  ${firstBlock}
  <div style="height:8px"></div>
  ${lastBlock}
`;

        showPreviewTip(revBtn, html);
      }, true);

      revBtn?.addEventListener("mouseleave", hidePreviewTip, true);
    }

    metaRow.style.display = "flex";
  });

  if (sawPinned) {
    try { scheduleSortMainPins(); } catch {}
  }
}


// --------------------------
// Observer (RAF-batched, ignores internal lock)
// --------------------------
(function setupMetaObserver() {
  let HO_META_SKIP_UNTIL = 0;
  function hoMetaMute(ms = 160){ HO_META_SKIP_UNTIL = Date.now() + ms; }

  function hoMetaFinishBoot(){
    requestAnimationFrame(() =>
      document.documentElement.classList.remove("ho-meta-boot")
    );
  }

  // show boot-hide until first render
  document.documentElement.classList.add("ho-meta-boot");

  const resync = () => {
    hoMetaMute(260);
    try { updateMetaFromOpenChat(); } catch {}
    try { renderMetaInProjectList(); } catch {}
    hoMetaFinishBoot();
  };

  let rafPending = false;
  let debounceTO = 0;

  let root = null;
  let observer = null;

  function getRoot(){
    return document.querySelector("main") || document.body;
  }

  function bindObserver(){
    const newRoot = getRoot();
    if (newRoot === root && observer) return;

    try { observer?.disconnect(); } catch {}
    root = newRoot;

    observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: false, characterData: false });
  }

  function schedule(){
    bindObserver(); // ✅ do this FIRST (main can swap)

    if (Date.now() < HO_META_SKIP_UNTIL) return;
    if (typeof hoLocked === "function" && hoLocked()) return;

    clearTimeout(debounceTO);
    debounceTO = setTimeout(() => {
      if (rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        if (Date.now() < HO_META_SKIP_UNTIL) return;

        if (typeof hoWithLock === "function") hoWithLock(resync);
        else resync();
      });
    }, 120);
  }



  function kickMetaResync(){

    document.documentElement.classList.add("ho-meta-boot");

    requestAnimationFrame(() => {
      bindObserver();
      if (typeof hoWithLock === "function") hoWithLock(resync);
      else resync();
    });

    setTimeout(() => {
      if (typeof hoWithLock === "function") hoWithLock(resync);
      else resync();
    }, 350);
  }

  window.addEventListener("ho:navigate", kickMetaResync, true);

    if (!window.__hoMetaSelfHeal) {
  window.__hoMetaSelfHeal = true;

    // ✅ Self-heal: if main list renders without meta rows, re-kick
setInterval(() => {
  if (typeof hoLocked === "function" && hoLocked()) return;
  if (Date.now() < HO_META_SKIP_UNTIL) return;

  const links = document.querySelectorAll('main a[href*="/c/"]');
  if (!links.length) return;

  const sample = [...links].slice(0, 6);
  const missing = sample.some(link => {
    const wrapper = link.querySelector(':scope > div') || link.firstElementChild;
    const leftCol = wrapper?.querySelector(':scope > div') || wrapper?.firstElementChild || wrapper;
    return leftCol && !leftCol.querySelector(':scope > .ho-meta-row');
  });

  if (missing) kickMetaResync();
}, 900);

}
  requestAnimationFrame(() => {
    bindObserver();
    kickMetaResync();
    try { scheduleSortMainPins(); } catch {}
  });
})();


})();


})();
