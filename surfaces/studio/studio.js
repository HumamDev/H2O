// @version 1.0.0
"use strict";

const MSG_ARCHIVE = "h2o-ext-archive:v1";
const LIST_ROW_OPS = ["listWorkbenchRows"];
const CHAT_ID_OPS = ["listAllChatIds", "listChatIds"];
const FOLDER_LIST_OPS = ["getFoldersList"];
const FOLDER_BINDING_OPS = ["resolveFolderBindings"];
const FOLDER_SET_OPS = ["setFolderBinding"];
const FOLDER_FILTER_NONE = "__none__";
const UI_PREFS_KEY = "h2o:archiveWorkbench:ui:vNext";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  rowsCache: null,
  folderCatalog: [],
  folderBindingsByChat: {},
  selectedSnapshotId: "",
  selectedChatId: "",
  lastView: "saved",
  lastFolderId: "",
  lastFetchDiag: null,
  currentReaderSnapshot: null,
  sidebarExpanded: true,
  density: "cozy",
  layout: "focused",
  renderToken: 0,
};

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function normalizeText(s){
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeRole(raw){
  return String(raw || "").trim().toLowerCase() === "user" ? "user" : "assistant";
}

function normalizeArchiveView(raw){
  const view = String(raw || "").trim().toLowerCase();
  if (view === "pinned") return "pinned";
  if (view === "archive") return "archive";
  return "saved";
}

function normalizeFolderFilter(raw){
  return String(raw || "").trim();
}

function normalizeDensity(raw){
  return String(raw || "").trim().toLowerCase() === "compact" ? "compact" : "cozy";
}

function normalizeLayout(raw){
  return String(raw || "").trim().toLowerCase() === "wide" ? "wide" : "focused";
}

function uniqStrings(arr){
  return [...new Set((Array.isArray(arr) ? arr : []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function countAssistantTurns(messages){
  return (Array.isArray(messages) ? messages : []).reduce((n, row) => n + (normalizeRole(row?.role) === "assistant" ? 1 : 0), 0);
}

function pluralize(count, singular, plural = `${singular}s`){
  return `${count} ${count === 1 ? singular : plural}`;
}

function fmtDate(iso){
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(String(iso)));
  } catch {
    return "";
  }
}

function fmtDateCompact(iso){
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(String(iso)));
  } catch {
    return "";
  }
}

function readUiPrefs(){
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    state.sidebarExpanded = prefs?.sidebarExpanded !== false;
    state.density = normalizeDensity(prefs?.density);
    state.layout = normalizeLayout(prefs?.layout);
  } catch {
    state.sidebarExpanded = true;
    state.density = "cozy";
    state.layout = "focused";
  }
}

function writeUiPrefs(){
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
      sidebarExpanded: state.sidebarExpanded,
      density: state.density,
      layout: state.layout,
    }));
  } catch {}
}

function applyUiState(){
  document.body.dataset.sidebar = state.sidebarExpanded ? "open" : "closed";
  document.body.dataset.density = state.density;
  document.body.dataset.layout = state.layout;
  document.body.dataset.route = state.currentReaderSnapshot ? "reader" : "list";

  const sidebarButtons = ["#sidebarToggleBtn", "#sidebarCollapseBtn", "#topSidebarBtn"];
  sidebarButtons.forEach((selector) => {
    const btn = $(selector);
    if (!btn) return;
    btn.setAttribute("aria-expanded", state.sidebarExpanded ? "true" : "false");
  });

  const densityBtn = $("#densityBtn");
  if (densityBtn) {
    densityBtn.textContent = state.density === "compact" ? "Compact" : "Cozy";
    densityBtn.title = `Toggle density (current: ${densityBtn.textContent})`;
  }

  const layoutBtn = $("#layoutBtn");
  if (layoutBtn) {
    layoutBtn.textContent = state.layout === "wide" ? "Wide" : "Focused";
    layoutBtn.title = `Toggle reader width (current: ${layoutBtn.textContent})`;
  }
}

function setRouteMeta(eyebrow, title, summary){
  const eyebrowEl = $("#routeEyebrow");
  const titleEl = $("#routeTitle");
  const summaryEl = $("#routeSummary");
  if (eyebrowEl) eyebrowEl.textContent = String(eyebrow || "");
  if (titleEl) titleEl.textContent = String(title || "");
  if (summaryEl) summaryEl.textContent = String(summary || "");
}

async function callArchive(op, payload = {}, nsDisk){
  const res = await chrome.runtime.sendMessage({
    type: MSG_ARCHIVE,
    req: { op, payload, nsDisk },
  });
  if (!res?.ok) throw new Error(res?.error || `Archive op failed: ${op}`);
  return res.result;
}

async function tryArchiveOp(op, payload = {}, nsDisk){
  try {
    return { ok: true, op, result: await callArchive(op, payload, nsDisk) };
  } catch (error){
    return { ok: false, op, error };
  }
}

async function tryArchiveOps(ops, payload = {}, nsDisk){
  let last = null;
  for (const op of (ops || [])){
    const attempt = await tryArchiveOp(op, payload, nsDisk);
    if (attempt.ok) return attempt;
    last = attempt.error;
  }
  return { ok: false, error: last };
}

function parseHash(){
  const raw = (location.hash || "#/saved").replace(/^#/, "");
  const [pathRaw, searchRaw = ""] = raw.split("?");
  const parts = pathRaw.split("/").filter(Boolean);
  if (parts[0] === "read") return { name: "read", snapshotId: decodeURIComponent(parts[1] || "") };
  const search = new URLSearchParams(searchRaw);
  return {
    name: "list",
    view: normalizeArchiveView(parts[0] || "saved"),
    folderId: normalizeFolderFilter(search.get("folder") || ""),
    chatId: String(search.get("chat") || "").trim(),
    snapshotId: String(search.get("snapshot") || "").trim(),
  };
}

function buildListHash(view, folderId = ""){
  const params = new URLSearchParams();
  const folder = normalizeFolderFilter(folderId);
  if (folder) params.set("folder", folder);
  const suffix = params.toString();
  return `#/${normalizeArchiveView(view)}${suffix ? `?${suffix}` : ""}`;
}

function viewLabel(view){
  const next = normalizeArchiveView(view);
  if (next === "pinned") return "Pinned";
  if (next === "archive") return "Archive";
  return "Saved";
}

function viewCopy(view){
  const next = normalizeArchiveView(view);
  if (next === "pinned") return "Pinned snapshots";
  if (next === "archive") return "Archived conversations";
  return "Saved chats";
}

function buildEmptyListState(view, folderId, query){
  const scope = [];
  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "");
  if (folderLabel) scope.push(`inside ${folderLabel}`);
  if (query) scope.push(`matching "${query}"`);
  const scopeText = scope.length ? ` ${scope.join(" ")}` : "";
  return `
    <div class="wbState">
      <div><strong>No ${esc(viewCopy(view).toLowerCase())}${esc(scopeText)}.</strong></div>
      <div style="margin-top:8px;">Capture a conversation from chatgpt.com with the archive tools, then refresh Studio.</div>
    </div>
  `;
}

function buildListErrorState(error){
  const msg = normalizeText(error?.message || error || "Unknown Studio error");
  return `
    <div class="wbState wbState--error">
      <div><strong>Studio cannot list snapshots yet.</strong></div>
      <div style="margin-top:8px;">${esc(msg)}</div>
      <div style="margin-top:8px;">The extension archive bridge is still the source of truth for this page.</div>
    </div>
  `;
}

function renderTextAsChatGPTBlocks(text){
  const src = String(text || "");
  const parts = src.split("```");
  const out = [];
  for (let i = 0; i < parts.length; i += 1){
    const seg = parts[i] ?? "";
    const isCode = (i % 2) === 1;
    if (isCode){
      const lines = seg.replace(/^\n+|\n+$/g, "").split("\n");
      const maybeLang = (lines[0] || "").trim();
      const codeBody = lines.slice(1).join("\n") || lines.join("\n");
      const langBadge = maybeLang ? `<div class="wbCodeLang">${esc(maybeLang)}</div>` : "";
      out.push(`<div class="wbCodeBlock">${langBadge}<pre><code>${esc(codeBody)}</code></pre></div>`);
      continue;
    }
    const clean = seg.replace(/\r/g, "");
    const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    for (const p of paras){
      out.push(`<div class="p">${esc(p)}</div>`);
    }
  }
  return out.join("") || `<div class="p"></div>`;
}

function sanitizeRichTurnFragment(htmlRaw){
  const html = String(htmlRaw || "").trim();
  if (!html) return null;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  tpl.content.querySelectorAll("script,style,link,iframe,object,embed").forEach((bad) => {
    try { bad.remove(); } catch {}
  });

  const all = tpl.content.querySelectorAll("*");
  for (const el of all){
    try {
      el.removeAttribute("id");
      el.removeAttribute("contenteditable");
      for (const attr of Array.from(el.attributes || [])){
        const name = String(attr?.name || "").toLowerCase();
        if (name.startsWith("on")) el.removeAttribute(attr.name);
        if ((name === "href" || name === "src") && /^\s*javascript:/i.test(String(attr.value || ""))){
          el.removeAttribute(attr.name);
        }
      }
      if (el.tagName === "A"){
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
      if (el.matches?.("button,input,textarea,select,summary,[role='button'],[tabindex]")){
        el.setAttribute("tabindex", "-1");
        el.setAttribute("aria-disabled", "true");
      }
      el.classList.add("wbFrozen");
    } catch {}
  }

  const roots = Array.from(tpl.content.children || []);
  if (!roots.length) return null;
  for (const root of roots){
    try {
      root.classList.add("wbRichRoot", "wbFrozen");
      root.setAttribute("data-wb-rich-root", "1");
    } catch {}
  }

  const frag = document.createDocumentFragment();
  while (tpl.content.firstChild) frag.appendChild(tpl.content.firstChild);
  return frag;
}

function normalizeRichTurns(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < src.length; i += 1){
    const row = src[i] && typeof src[i] === "object" ? src[i] : {};
    const turnIdx = Math.max(1, Math.floor(Number(row.turnIdx ?? row.idx ?? (i + 1)) || (i + 1)));
    const role = normalizeRole(row.role || row.author || "assistant");
    const outerHTML = String(row.outerHTML || row.html || "").trim();
    if (!outerHTML) continue;
    out.push({ turnIdx, role, outerHTML });
  }
  out.sort((a, b) => Number(a.turnIdx) - Number(b.turnIdx));
  return out;
}

function normalizeTurnHighlights(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < src.length; i += 1){
    const row = src[i] && typeof src[i] === "object" ? src[i] : {};
    const turnIdx = Math.max(1, Math.floor(Number(row.turnIdx ?? row.answerIndex ?? (i + 1)) || (i + 1)));
    const colors = uniqStrings(row.colors || row.highlightColors || row.values || []);
    if (!colors.length) continue;
    out.push({ turnIdx, colors });
  }
  out.sort((a, b) => Number(a.turnIdx) - Number(b.turnIdx));
  return out;
}

function normalizeMiniMapDotColor(raw){
  const color = String(raw || "").trim();
  const lower = color.toLowerCase();
  const aliases = {
    gold: "#f7d34a",
    yellow: "#f7d34a",
    blue: "#66b5ff",
    pink: "#ff79c6",
    green: "#35c759",
    purple: "#a78bfa",
    orange: "#fb923c",
    red: "#f87171",
  };
  for (const [token, value] of Object.entries(aliases)){
    if (lower === token || lower.includes(token)) return value;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|hsl)a?\([^)]+\)$/i.test(color)) return color;
  if (/^[a-z-]{3,32}$/i.test(lower)) return lower;
  return "";
}

function buildExcerptFromMessages(messages){
  const firstAssistant = (messages || []).find((row) => normalizeRole(row?.role) === "assistant" && row?.text);
  const first = firstAssistant || (messages || [])[0];
  return normalizeText(first?.text || "").slice(0, 240);
}

function buildCanonicalMessage(role, text, meta = {}){
  const wrap = document.createElement("div");
  wrap.className = `cgMsg cgMsg--${role}`;

  const bodyEl = document.createElement("div");
  bodyEl.className = "cgMsgBody";
  bodyEl.innerHTML = renderTextAsChatGPTBlocks(text);

  wrap.appendChild(bodyEl);

  if (meta.turnIdx && role === "assistant"){
    wrap.dataset.turnIdx = String(meta.turnIdx);
  }
  return wrap;
}

function buildCanonicalConversation(container, snap){
  const messages = Array.isArray(snap?.messages) ? snap.messages : [];
  const assistantTurns = [];
  let answerIdx = 0;

  for (const row of messages){
    const role = normalizeRole(row?.role);
    const text = String(row?.text || "");
    const turn = document.createElement("article");
    turn.className = `cgTurn cgTurn--${role}`;
    turn.dataset.messageAuthorRole = role;

    if (role === "assistant"){
      answerIdx += 1;
      turn.dataset.turnIdx = String(answerIdx);
      assistantTurns.push(turn);
    }

    turn.appendChild(buildCanonicalMessage(role, text, { turnIdx: answerIdx }));
    container.appendChild(turn);
  }

  return assistantTurns;
}

function mountRichTurns(container, richTurns){
  const normalized = normalizeRichTurns(richTurns);
  const assistantHosts = [];
  for (const turn of normalized){
    const frag = sanitizeRichTurnFragment(turn.outerHTML);
    if (!frag) continue;
    const host = document.createElement("article");
    host.className = `cgTurn cgTurn--${turn.role} wbTurn wbTurn--rich wbTurn--${turn.role}`;
    host.dataset.turnIdx = String(turn.turnIdx);
    host.dataset.messageAuthorRole = turn.role;

    const frame = document.createElement("div");
    frame.className = `cgMsg cgMsg--rich cgMsg--${turn.role}`;
    frame.appendChild(frag);
    host.appendChild(frame);
    container.appendChild(host);

    if (turn.role === "assistant") assistantHosts.push(host);
  }
  return assistantHosts;
}

function appendMiniMapDots(btn, colors){
  const palette = uniqStrings(colors).slice(0, 4);
  if (!palette.length) return;
  btn.classList.add("has-dots");
  const dots = document.createElement("span");
  dots.className = "cgMMDots";
  for (const color of palette){
    const dot = document.createElement("span");
    dot.className = "cgMMDot";
    const safeColor = normalizeMiniMapDotColor(color);
    if (safeColor) dot.style.background = safeColor;
    dot.title = String(color || "");
    dots.appendChild(dot);
  }
  btn.appendChild(dots);
}

function buildMiniMap(mm, turnEls, turnHighlightsRaw = []){
  const items = (Array.isArray(turnEls) ? turnEls : []).filter(Boolean);
  const highlightMap = new Map(normalizeTurnHighlights(turnHighlightsRaw).map((row) => [Number(row.turnIdx), row.colors.slice()]));
  mm.textContent = "";
  items.forEach((turnEl, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgMMBtn";

    const answerIndex = index + 1;
    button.title = `Answer ${answerIndex}/${items.length}`;
    const num = document.createElement("span");
    num.className = "cgMMIndex";
    num.textContent = String(answerIndex);
    button.appendChild(num);

    const turnIdx = Math.max(1, Math.floor(Number(turnEl?.dataset?.turnIdx || answerIndex) || answerIndex));
    appendMiniMapDots(button, highlightMap.get(answerIndex) || highlightMap.get(turnIdx) || []);

    button.addEventListener("click", () => {
      $$(".cgMMBtn", mm).forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      turnEl.scrollIntoView({ behavior: "smooth", block: "center" });
      try {
        turnEl.animate(
          [{ backgroundColor: "rgba(139,183,255,.12)" }, { backgroundColor: "" }],
          { duration: 520 }
        );
      } catch {}
    });

    mm.appendChild(button);
  });

  mm.hidden = items.length === 0;
  if (items.length) mm.firstElementChild?.classList.add("active");
}

function normalizeWorkbenchRow(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const snapshotId = String(row.snapshotId || meta.snapshotId || "").trim();
  const chatId = String(row.chatId || meta.chatId || "").trim();
  if (!snapshotId || !chatId) return null;

  const title = String(row.title || meta.title || chatId).trim() || chatId;
  const excerpt = String(row.excerpt || meta.excerpt || buildExcerptFromMessages(messages)).trim();
  const createdAt = String(row.createdAt || row.updatedAt || meta.updatedAt || "").trim();
  const updatedAt = String(row.updatedAt || meta.updatedAt || createdAt).trim();
  const messageCount = Number(row.messageCount || messages.length || meta.messageCount || 0);
  const answerCount = Number(row.answerCount || meta.answerCount || countAssistantTurns(messages));
  const pinned = !!row.pinned;
  const archived = !!row.archived;
  const folderId = String(row.folderId || meta.folderId || meta.folder || "").trim();
  const folderName = String(row.folderName || meta.folderName || "").trim();
  const tags = uniqStrings(row.tags || meta.tags || []);

  return {
    snapshotId,
    chatId,
    title,
    excerpt,
    createdAt,
    updatedAt,
    messageCount: Number.isFinite(messageCount) ? Math.max(0, Math.floor(messageCount)) : 0,
    answerCount: Number.isFinite(answerCount) ? Math.max(0, Math.floor(answerCount)) : 0,
    pinned,
    archived,
    folderId,
    folderName,
    tags,
  };
}

async function buildRowsFromChatIds(chatIds){
  const rows = [];
  const ids = uniqStrings(chatIds);
  const maxWorkers = 6;
  let index = 0;

  async function worker(){
    while (index < ids.length){
      const current = ids[index];
      index += 1;

      const [latest, snapshots] = await Promise.all([
        callArchive("loadLatestSnapshot", { chatId: current }).catch(() => null),
        callArchive("listSnapshots", { chatId: current }).catch(() => []),
      ]);

      if (!latest) continue;
      const pinned = Array.isArray(snapshots) && snapshots.some((row) => !!row?.pinned);
      const normalized = normalizeWorkbenchRow({
        ...latest,
        pinned,
        archived: false,
      });
      if (normalized) rows.push(normalized);
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxWorkers, ids.length) }, worker));
  return rows;
}

async function fetchWorkbenchRows(force = false){
  if (!force && Array.isArray(state.rowsCache)) return state.rowsCache.slice();

  state.lastFetchDiag = { source: "", directOk: false, idsOk: false, errors: [] };

  const direct = await tryArchiveOps(LIST_ROW_OPS, {});
  if (direct.ok && Array.isArray(direct.result)){
    state.lastFetchDiag = { source: direct.op, directOk: true, idsOk: false, errors: [] };
    state.rowsCache = direct.result.map(normalizeWorkbenchRow).filter(Boolean);
    return state.rowsCache.slice();
  }

  const directErr = direct.error?.message || "";
  const idsAttempt = await tryArchiveOps(CHAT_ID_OPS, {});
  if (idsAttempt.ok && Array.isArray(idsAttempt.result)){
    state.lastFetchDiag = { source: idsAttempt.op, directOk: false, idsOk: true, errors: directErr ? [directErr] : [] };
    state.rowsCache = await buildRowsFromChatIds(idsAttempt.result);
    return state.rowsCache.slice();
  }

  const errors = [directErr, idsAttempt.error?.message || ""].filter(Boolean);
  state.lastFetchDiag = { source: "", directOk: false, idsOk: false, errors };
  throw new Error(errors.join(" · ") || "Studio listing is unavailable because the archive background does not expose a list operation yet.");
}

function normalizeFolderCatalog(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of src){
    const id = String(row?.id || row?.folderId || "").trim();
    if (!id || seen.has(id)) continue;
    out.push({
      id,
      name: String(row?.name || row?.title || id).trim() || id,
      createdAt: String(row?.createdAt || "").trim(),
    });
    seen.add(id);
  }
  return out;
}

function mergeFolderCatalogs(...lists){
  const out = [];
  const seen = new Set();
  for (const raw of lists){
    for (const item of normalizeFolderCatalog(raw)){
      if (seen.has(item.id)){
        const existing = out.find((row) => row.id === item.id);
        if (existing && (!existing.name || existing.name === existing.id) && item.name) {
          existing.name = item.name;
        }
        continue;
      }
      out.push({ ...item });
      seen.add(item.id);
    }
  }
  return out;
}

function deriveFolderCatalogFromRows(rows){
  const derived = [];
  const seen = new Set();
  for (const row of (Array.isArray(rows) ? rows : [])){
    const folderId = String(row?.folderId || "").trim();
    if (!folderId || seen.has(folderId)) continue;
    derived.push({
      id: folderId,
      name: String(row?.folderName || folderId).trim() || folderId,
      createdAt: "",
    });
    seen.add(folderId);
  }
  derived.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  return derived;
}

function normalizeFolderBinding(raw){
  return {
    folderId: String(raw?.folderId || raw?.id || "").trim(),
    folderName: String(raw?.folderName || raw?.name || raw?.title || "").trim(),
  };
}

function normalizeFolderBindingMap(raw){
  const out = new Map();
  if (Array.isArray(raw)){
    for (const row of raw){
      const chatId = String(row?.chatId || "").trim();
      if (!chatId) continue;
      out.set(chatId, normalizeFolderBinding(row));
    }
    return out;
  }
  if (!raw || typeof raw !== "object") return out;
  for (const [chatId, value] of Object.entries(raw)){
    const id = String(chatId || "").trim();
    if (!id) continue;
    out.set(id, normalizeFolderBinding(value));
  }
  return out;
}

function resolveFolderName(folderId){
  const id = String(folderId || "").trim();
  if (!id) return "";
  const fromCatalog = state.folderCatalog.find((row) => row.id === id);
  if (fromCatalog?.name) return fromCatalog.name;
  const fromRows = (state.rowsCache || []).find((row) => String(row.folderId || "").trim() === id);
  if (fromRows?.folderName) return fromRows.folderName;
  return id;
}

function getSelectedRow(){
  const sid = String(state.selectedSnapshotId || state.currentReaderSnapshot?.snapshotId || "").trim();
  if (!sid) return null;
  return (state.rowsCache || []).find((row) => row.snapshotId === sid) || null;
}

function getSelectedFolderId(){
  const row = getSelectedRow();
  if (row) return String(row.folderId || "").trim();
  return String(state.currentReaderSnapshot?.meta?.folderId || "").trim();
}

function rememberFolderBindings(map){
  for (const [chatId, binding] of map.entries()){
    state.folderBindingsByChat[chatId] = normalizeFolderBinding(binding);
  }
}

async function fetchFolderCatalog(force = false){
  if (!force && Array.isArray(state.folderCatalog) && state.folderCatalog.length) return state.folderCatalog.slice();
  const attempt = await tryArchiveOps(FOLDER_LIST_OPS, {});
  if (attempt.ok){
    state.folderCatalog = normalizeFolderCatalog(attempt.result);
  }
  return Array.isArray(state.folderCatalog) ? state.folderCatalog.slice() : [];
}

async function resolveFolderBindingsForChatIds(chatIds){
  const ids = uniqStrings(chatIds);
  if (!ids.length) return new Map();

  const attempt = await tryArchiveOps(FOLDER_BINDING_OPS, { chatIds: ids });
  if (!attempt.ok) {
    const fallback = new Map();
    for (const chatId of ids){
      if (!Object.prototype.hasOwnProperty.call(state.folderBindingsByChat, chatId)) continue;
      fallback.set(chatId, normalizeFolderBinding(state.folderBindingsByChat[chatId]));
    }
    return fallback;
  }

  const map = normalizeFolderBindingMap(attempt.result);
  rememberFolderBindings(map);
  return map;
}

function mergeRowFolderData(row, bindingMap){
  const next = { ...row };
  const hasBinding = bindingMap.has(next.chatId);
  const binding = hasBinding ? normalizeFolderBinding(bindingMap.get(next.chatId)) : null;

  if (binding){
    next.folderId = binding.folderId;
    next.folderName = binding.folderId
      ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
      : "";
  } else if (next.folderId) {
    next.folderName = String(next.folderName || resolveFolderName(next.folderId) || next.folderId).trim();
  } else {
    next.folderName = "";
  }

  return next;
}

async function enrichRowsWithFolderData(rows, force = false){
  const baseRows = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  const fallbackCatalog = deriveFolderCatalogFromRows(baseRows);
  const [catalog, bindingMap] = await Promise.all([
    fetchFolderCatalog(force).catch(() => []),
    resolveFolderBindingsForChatIds(baseRows.map((row) => row.chatId)).catch(() => new Map()),
  ]);

  state.folderCatalog = mergeFolderCatalogs(catalog, fallbackCatalog);
  const merged = baseRows.map((row) => mergeRowFolderData(row, bindingMap));
  state.rowsCache = merged.slice();
  return merged;
}

function matchesView(row, view){
  if (!row) return false;
  const next = normalizeArchiveView(view);
  if (next === "pinned") return !!row.pinned;
  if (next === "archive") return !!row.archived;
  if (next === "saved") return !row.archived;
  return true;
}

function matchesFolder(row, folderId){
  const filterId = normalizeFolderFilter(folderId);
  if (!filterId) return true;
  const rowFolderId = String(row?.folderId || "").trim();
  if (filterId === FOLDER_FILTER_NONE) return !rowFolderId;
  return rowFolderId === filterId;
}

function filterRows(rows, view, query, folderId = ""){
  const q = normalizeText(query).toLowerCase();
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!matchesView(row, view)) return false;
    if (!matchesFolder(row, folderId)) return false;

    if (!q) return true;
    const haystack = [
      row.title,
      row.excerpt,
      row.chatId,
      row.folderId,
      row.folderName,
      ...(row.tags || []),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
  return filtered;
}

function setActiveNav(view){
  const next = normalizeArchiveView(view);
  state.lastView = next;
  $$(".wbNavItem[data-view]").forEach((node) => {
    node.classList.toggle("active", String(node.dataset.view || "") === next);
  });
}

function setActiveFolder(folderId){
  const selected = normalizeFolderFilter(folderId);
  state.lastFolderId = selected;
  $$(".wbFolderItem[data-folder-id]").forEach((node) => {
    node.classList.toggle("active", String(node.dataset.folderId || "") === selected);
  });
}

function buildFilterPill(label, accent = false){
  return `<span class="wbFilterPill${accent ? " wbFilterPill--accent" : ""}">${esc(label)}</span>`;
}

function renderListHeader(allRows, filteredRows, view, folderId, query){
  const totalForView = (Array.isArray(allRows) ? allRows : []).filter((row) => matchesView(row, view)).length;
  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "All folders");

  const title = viewCopy(view);
  let subtitle = `${pluralize(filteredRows.length, "chat")} shown`;
  if (totalForView !== filteredRows.length) subtitle += ` of ${pluralize(totalForView, "chat")}`;
  if (folderId) subtitle += ` in ${folderLabel}`;
  if (query) subtitle += ` matching "${query}"`;

  const pills = [
    buildFilterPill(viewLabel(view), true),
  ];
  if (folderId) pills.push(buildFilterPill(folderLabel, true));
  if (query) pills.push(buildFilterPill(`Search: ${query}`));
  pills.push(buildFilterPill(`${filteredRows.length} shown`));

  const titleEl = $("#listTitle");
  const subtitleEl = $("#listSubtitle");
  const filterEl = $("#listFilters");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (filterEl) filterEl.innerHTML = pills.join("");

  setRouteMeta(viewLabel(view), folderId ? `${title} / ${folderLabel}` : title, subtitle);
}

function collectFolderSidebarItems(rows, view){
  const base = (Array.isArray(rows) ? rows : []).filter((row) => matchesView(row, view));
  const counts = new Map();
  let unfiledCount = 0;
  for (const row of base){
    const folderId = String(row?.folderId || "").trim();
    if (!folderId) {
      unfiledCount += 1;
      continue;
    }
    counts.set(folderId, (counts.get(folderId) || 0) + 1);
  }

  const catalog = mergeFolderCatalogs(state.folderCatalog, deriveFolderCatalogFromRows(base));
  const out = [{ folderId: "", label: "All folders", count: base.length, kind: "all" }];
  for (const folder of catalog){
    out.push({
      folderId: folder.id,
      label: folder.name || folder.id,
      count: counts.get(folder.id) || 0,
      kind: "folder",
    });
  }
  if (unfiledCount || state.lastFolderId === FOLDER_FILTER_NONE) {
    out.push({ folderId: FOLDER_FILTER_NONE, label: "Unfiled", count: unfiledCount, kind: "utility" });
  }
  return out;
}

function renderFolderSidebar(rows, view, selectedFolderId){
  const host = $("#folderList");
  if (!host) return;
  const items = collectFolderSidebarItems(rows, view);
  host.innerHTML = "";

  const folderEntries = items.filter((item) => item.kind === "folder");
  if (items.length <= 1 && !folderEntries.length){
    host.innerHTML = `<div class="wbSideEmpty">No saved folder contract found yet. Capture or assign a chat to a folder from chatgpt.com.</div>`;
    setActiveFolder("");
    return;
  }

  items.forEach((item) => {
    const link = document.createElement("a");
    link.className = "wbFolderItem";
    if (!item.count) link.classList.add("is-empty");
    link.href = buildListHash(view, item.folderId);
    link.dataset.folderId = String(item.folderId || "");
    link.innerHTML = `
      <span class="wbFolderLabel">${esc(item.label)}</span>
      <span class="wbFolderCount">${esc(String(item.count || 0))}</span>
    `;
    host.appendChild(link);
  });

  setActiveFolder(selectedFolderId);
}

function getActiveSnapshotId(){
  return String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
}

function setActiveSidebarChat(snapshotId = ""){
  const activeSnapshotId = String(snapshotId || getActiveSnapshotId()).trim();
  $$(".wbSidebarChatItem[data-snapshot-id]").forEach((node) => {
    node.classList.toggle("active", String(node.dataset.snapshotId || "").trim() === activeSnapshotId);
  });
}

function setSidebarChatLoading(view, folderId = ""){
  const host = $("#sidebarChatList");
  const labelEl = $("#sidebarChatsLabel");
  const metaEl = $("#sidebarChatsMeta");
  if (!(host && labelEl && metaEl)) return;

  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "");
  labelEl.textContent = folderLabel || viewCopy(view);
  metaEl.textContent = "Loading…";
  host.innerHTML = `<div class="wbSideEmpty">Loading chats…</div>`;
}

function renderSidebarChatList(rows, view, folderId = "", query = ""){
  const host = $("#sidebarChatList");
  const labelEl = $("#sidebarChatsLabel");
  const metaEl = $("#sidebarChatsMeta");
  if (!(host && labelEl && metaEl)) return;

  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "");
  labelEl.textContent = folderLabel || viewCopy(view);
  metaEl.textContent = [
    pluralize((Array.isArray(rows) ? rows : []).length, "chat"),
    query ? "Filtered" : "",
  ].filter(Boolean).join(" · ");

  host.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length){
    host.innerHTML = `<div class="wbSideEmpty">No chats match the current archive view.</div>`;
    setActiveSidebarChat("");
    return;
  }

  const activeSnapshotId = getActiveSnapshotId();
  const frag = document.createDocumentFragment();
  list.slice(0, 30).forEach((row) => {
    const link = document.createElement("a");
    link.className = "wbSidebarChatItem";
    link.href = `#/read/${encodeURIComponent(row.snapshotId)}`;
    link.dataset.snapshotId = row.snapshotId;
    link.dataset.chatId = row.chatId;
    if (row.snapshotId === activeSnapshotId) link.classList.add("active");

    const meta = [
      row.folderId ? (row.folderName || row.folderId) : "",
      fmtDateCompact(row.updatedAt || row.createdAt || ""),
      row.pinned ? "Pinned" : "",
    ].filter(Boolean).join(" · ") || row.chatId;

    link.innerHTML = `
      <span class="wbSidebarChatTitle">${esc(row.title)}</span>
      <span class="wbSidebarChatMeta">${esc(meta)}</span>
    `;

    frag.appendChild(link);
  });

  host.appendChild(frag);
  setActiveSidebarChat(activeSnapshotId);
}

function refreshSidebarChatList(view = state.lastView, folderId = state.lastFolderId){
  const query = $("#q")?.value || "";
  const rows = filterRows(state.rowsCache || [], view, query, folderId);
  renderSidebarChatList(rows, view, folderId, query);
}

function updateRowFolderBinding(chatId, folderData){
  const id = String(chatId || "").trim();
  if (!id) return;
  const binding = normalizeFolderBinding(folderData);
  state.folderBindingsByChat[id] = binding;

  if (Array.isArray(state.rowsCache)){
    state.rowsCache = state.rowsCache.map((row) => {
      if (row.chatId !== id) return row;
      return {
        ...row,
        folderId: binding.folderId,
        folderName: binding.folderId
          ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
          : "",
      };
    });
  }

  if (state.currentReaderSnapshot?.chatId === id) {
    const meta = state.currentReaderSnapshot.meta && typeof state.currentReaderSnapshot.meta === "object"
      ? state.currentReaderSnapshot.meta
      : {};
    state.currentReaderSnapshot.meta = {
      ...meta,
      folderId: binding.folderId,
      folderName: binding.folderId
        ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
        : "",
    };
  }
}

function renderFolderAssignmentControl(){
  const wrap = $("#folderAssignWrap");
  const select = $("#folderAssignSelect");
  if (!(wrap && select)) return;

  const selectedChatId = String(state.selectedChatId || state.currentReaderSnapshot?.chatId || "").trim();
  const catalog = mergeFolderCatalogs(state.folderCatalog, deriveFolderCatalogFromRows(state.rowsCache || []));
  const currentFolderId = getSelectedFolderId();

  if (!selectedChatId || (!catalog.length && !currentFolderId)) {
    wrap.hidden = true;
    select.innerHTML = "";
    return;
  }

  const options = [{ value: "", label: "Unfiled" }, ...catalog.map((item) => ({
    value: String(item.id || ""),
    label: String(item.name || item.id || ""),
  }))];

  select.innerHTML = options.map((item) => (
    `<option value="${esc(item.value)}">${esc(item.label)}</option>`
  )).join("");

  const hasCurrent = options.some((item) => item.value === currentFolderId);
  select.value = hasCurrent ? currentFolderId : "";
  wrap.hidden = false;
}

function syncSelectionControls(){
  const openBtn = $("#openReaderTabBtn");
  const sid = String(state.selectedSnapshotId || state.currentReaderSnapshot?.snapshotId || "").trim();
  if (openBtn) {
    openBtn.disabled = !sid;
    openBtn.dataset.snapshotId = sid;
  }
  renderFolderAssignmentControl();
}

function selectRow(row, articleEl){
  state.selectedSnapshotId = String(row?.snapshotId || "").trim();
  state.selectedChatId = String(row?.chatId || "").trim();

  $$(".wbHistoryRow.is-selected").forEach((node) => node.classList.remove("is-selected"));
  if (articleEl) articleEl.classList.add("is-selected");
  setActiveSidebarChat(state.selectedSnapshotId);
  syncSelectionControls();
}

function renderRow(row, isSelected = false){
  const article = document.createElement("article");
  article.className = "wbHistoryRow";
  article.dataset.snapshotId = row.snapshotId;
  article.dataset.chatId = row.chatId;
  if (isSelected) article.classList.add("is-selected");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "wbRowMain";

  const badges = [
    row.folderId ? `<span class="wbBadge wbBadge--folder">${esc(row.folderName || row.folderId)}</span>` : "",
    row.pinned ? `<span class="wbBadge wbBadge--pin">Pinned</span>` : "",
    row.archived ? `<span class="wbBadge wbBadge--archive">Archived</span>` : "",
  ].filter(Boolean).join("");

  button.innerHTML = `
    <div class="wbRowTitleLine">
      <div class="wbTitle">${esc(row.title)}</div>
      <div class="wbRowDate">${esc(fmtDateCompact(row.updatedAt || row.createdAt))}</div>
    </div>
    <div class="wbExcerpt">${esc(row.excerpt || "No excerpt captured yet.")}</div>
    <div class="wbMeta">
      <span>${esc(pluralize(row.messageCount || 0, "message"))}</span>
      <span>${esc(pluralize(row.answerCount || 0, "answer"))}</span>
      <span class="wbMetaChatId">${esc(row.chatId)}</span>
    </div>
    ${badges ? `<div class="wbBadges">${badges}</div>` : ""}
  `;

  article.appendChild(button);
  article.addEventListener("pointerenter", () => selectRow(row, article));
  article.addEventListener("focusin", () => selectRow(row, article));
  button.addEventListener("click", () => {
    selectRow(row, article);
    location.hash = `#/read/${encodeURIComponent(row.snapshotId)}`;
  });

  return article;
}

function buildReaderDOM(snap){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const title = String(meta.title || snap?.chatId || "Saved chat");
  const messageCount = Number(snap?.messageCount || snap?.messages?.length || meta.messageCount || 0);
  const answerCount = Number(meta.answerCount || countAssistantTurns(snap?.messages));
  const summary = [
    fmtDate(snap?.createdAt || meta.updatedAt || ""),
    pluralize(messageCount, "message"),
    pluralize(answerCount, "answer"),
  ].filter(Boolean).join(" · ");

  const root = document.createElement("div");
  root.className = "cgFrame";
  root.innerHTML = `
    <div class="cgTop">
      <div class="cgTopMeta">
        <div class="cgKicker">Saved conversation</div>
        <div class="cgH1">${esc(title)}</div>
        <div class="cgTopSummary">${esc(summary)}</div>
      </div>
      <div class="cgTopActions">
        <button class="wbBtn" type="button" data-act="back">Library</button>
        <button class="wbBtn wbBtnPrimary" type="button" data-act="openTab">Open</button>
      </div>
    </div>
    <div class="cgBody">
      <div class="cgThread">
        <div class="cgScroll"></div>
      </div>
      <aside class="cgMiniMapDock">
        <div class="cgMiniMap"></div>
      </aside>
    </div>
  `;

  const sc = root.querySelector(".cgScroll");
  const mm = root.querySelector(".cgMiniMap");
  const richTurns = normalizeRichTurns(meta.richTurns);
  const turnHighlights = normalizeTurnHighlights(meta.turnHighlights);
  let assistantTurnEls = [];

  if (richTurns.length){
    sc.classList.add("is-rich");
    assistantTurnEls = mountRichTurns(sc, richTurns);
  }

  if (!assistantTurnEls.length){
    sc.classList.remove("is-rich");
    assistantTurnEls = buildCanonicalConversation(sc, snap);
  }

  buildMiniMap(mm, assistantTurnEls, turnHighlights);

  root.querySelector('[data-act="back"]')?.addEventListener("click", () => {
    location.hash = buildListHash(state.lastView || "saved", state.lastFolderId || "");
  });

  root.querySelector('[data-act="openTab"]')?.addEventListener("click", async () => {
    try {
      await callArchive("openWorkbench", { route: `/read/${encodeURIComponent(snap.snapshotId)}` });
    } catch {
      location.hash = `#/read/${encodeURIComponent(snap.snapshotId)}`;
    }
  });

  return root;
}

function renderReaderRouteMeta(snap){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const title = String(meta.title || snap?.chatId || "Saved chat");
  const answerCount = Number(meta.answerCount || countAssistantTurns(snap?.messages));
  const summary = [
    fmtDate(snap?.createdAt || meta.updatedAt || ""),
    pluralize(answerCount, "answer"),
    meta.folderId ? `Folder: ${meta.folderName || resolveFolderName(meta.folderId) || meta.folderId}` : "",
  ].filter(Boolean).join(" · ");
  setRouteMeta("Reader", title, summary || "Saved conversation");
}

async function renderList(view, folderId = "", opts = {}){
  const token = ++state.renderToken;
  const nextView = normalizeArchiveView(view);
  const selectedFolderId = normalizeFolderFilter(folderId);
  const query = $("#q")?.value || "";
  const listPanel = $("#viewListPanel");
  const listEl = $("#viewList");
  const readerEl = $("#viewReader");

  state.currentReaderSnapshot = null;
  state.lastView = nextView;
  state.lastFolderId = selectedFolderId;
  applyUiState();
  setActiveNav(nextView);

  if (readerEl) readerEl.hidden = true;
  if (listPanel) listPanel.hidden = false;
  if (listEl) listEl.innerHTML = `<div class="wbState">Loading ${esc(viewCopy(nextView).toLowerCase())}…</div>`;
  setSidebarChatLoading(nextView, selectedFolderId);
  setRouteMeta(viewLabel(nextView), viewCopy(nextView), "Loading archive state");

  try {
    const fetched = await fetchWorkbenchRows(!!opts.force);
    if (token !== state.renderToken) return;
    const allRows = await enrichRowsWithFolderData(fetched, !!opts.force);
    if (token !== state.renderToken) return;

    renderFolderSidebar(allRows, nextView, selectedFolderId);
    const rows = filterRows(allRows, nextView, query, selectedFolderId);
    renderSidebarChatList(rows, nextView, selectedFolderId, query);
    renderListHeader(allRows, rows, nextView, selectedFolderId, query);

    if (!rows.length){
      if (listEl) listEl.innerHTML = buildEmptyListState(nextView, selectedFolderId, query);
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      setActiveSidebarChat("");
      syncSelectionControls();
      return;
    }

    if (listEl) listEl.innerHTML = "";
    let selectedRow = null;
    let selectedEl = null;
    const preferredSnapshotId = String(opts.snapshotId || "").trim();
    const preferredChatId = String(opts.chatId || "").trim();
    const currentSelectedSnapshotId = String(state.selectedSnapshotId || "").trim();

    const frag = document.createDocumentFragment();
    rows.forEach((row, index) => {
      const isSelected = preferredSnapshotId
        ? preferredSnapshotId === row.snapshotId
        : preferredChatId
          ? preferredChatId === row.chatId
          : currentSelectedSnapshotId
            ? currentSelectedSnapshotId === row.snapshotId
            : index === 0;
      const el = renderRow(row, isSelected);
      frag.appendChild(el);
      if (isSelected && !selectedRow) {
        selectedRow = row;
        selectedEl = el;
      }
    });
    listEl?.appendChild(frag);

    if (!selectedRow) {
      selectedRow = rows[0];
      selectedEl = listEl?.querySelector(".wbHistoryRow") || null;
    }
    if (selectedRow) selectRow(selectedRow, selectedEl);
  } catch (error){
    renderFolderSidebar(state.rowsCache || [], nextView, selectedFolderId);
    refreshSidebarChatList(nextView, selectedFolderId);
    renderListHeader(state.rowsCache || [], [], nextView, selectedFolderId, query);
    if (listEl) listEl.innerHTML = buildListErrorState(error);
    state.selectedSnapshotId = "";
    state.selectedChatId = "";
    setActiveSidebarChat("");
    syncSelectionControls();
  }
}

async function renderReader(snapshotId){
  const token = ++state.renderToken;
  const sid = String(snapshotId || "").trim();
  const listPanel = $("#viewListPanel");
  const readerEl = $("#viewReader");

  if (listPanel) listPanel.hidden = true;
  if (readerEl) readerEl.hidden = false;
  if (readerEl) readerEl.innerHTML = `<div class="wbState">Loading reader…</div>`;
  setRouteMeta("Reader", "Saved chat", "Loading snapshot");

  try {
    const snap = await callArchive("loadSnapshot", { snapshotId: sid });
    if (token !== state.renderToken) return;
    if (!snap){
      if (readerEl) readerEl.innerHTML = `<div class="wbState">Snapshot not found.</div>`;
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      state.currentReaderSnapshot = null;
      syncSelectionControls();
      return;
    }

    state.currentReaderSnapshot = snap;
    state.selectedSnapshotId = String(snap.snapshotId || "").trim();
    state.selectedChatId = String(snap.chatId || "").trim();

    if (!Array.isArray(state.rowsCache)) {
      try {
        const rows = await fetchWorkbenchRows(false);
        if (token !== state.renderToken) return;
        await enrichRowsWithFolderData(rows, false);
      } catch {}
    }
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);

    await fetchFolderCatalog(false).catch(() => []);
    const bindings = await resolveFolderBindingsForChatIds([snap.chatId]).catch(() => new Map());
    if (token !== state.renderToken) return;
    if (bindings.has(snap.chatId)) {
      const binding = normalizeFolderBinding(bindings.get(snap.chatId));
      const meta = snap.meta && typeof snap.meta === "object" ? snap.meta : {};
      snap.meta = {
        ...meta,
        folderId: binding.folderId,
        folderName: binding.folderId
          ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
          : "",
      };
      updateRowFolderBinding(snap.chatId, snap.meta);
    }
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
    refreshSidebarChatList(state.lastView, state.lastFolderId);

    if (readerEl) {
      readerEl.innerHTML = "";
      readerEl.appendChild(buildReaderDOM(snap));
    }
    renderReaderRouteMeta(snap);
    setActiveSidebarChat(state.selectedSnapshotId);
    syncSelectionControls();
    applyUiState();
  } catch (error){
    if (readerEl) {
      readerEl.innerHTML = `<div class="wbState wbState--error">${esc(error?.message || "Failed to load snapshot.")}</div>`;
    }
    state.selectedSnapshotId = "";
    state.selectedChatId = "";
    state.currentReaderSnapshot = null;
    setActiveSidebarChat("");
    syncSelectionControls();
  }
}

function openSelectedReaderTab(){
  const sid = String($("#openReaderTabBtn")?.dataset?.snapshotId || "").trim();
  if (!sid) return;
  callArchive("openWorkbench", { route: `/read/${encodeURIComponent(sid)}` }).catch(() => {
    location.hash = `#/read/${encodeURIComponent(sid)}`;
  });
}

async function handleFolderAssignChange(){
  const select = $("#folderAssignSelect");
  const chatId = String(state.selectedChatId || state.currentReaderSnapshot?.chatId || "").trim();
  if (!(select && chatId)) return;

  const nextFolderId = normalizeFolderFilter(select.value);
  select.disabled = true;
  try {
    const attempt = await tryArchiveOps(FOLDER_SET_OPS, { chatId, folderId: nextFolderId });
    if (!attempt.ok) throw attempt.error || new Error("Folder update failed");

    const binding = normalizeFolderBinding(attempt.result);
    updateRowFolderBinding(chatId, binding);
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
    renderFolderAssignmentControl();

    const route = parseHash();
    if (route.name === "list") {
      await renderList(route.view, route.folderId, {
        chatId,
        snapshotId: state.selectedSnapshotId,
      });
      return;
    }

    refreshSidebarChatList(state.lastView, state.lastFolderId);
    renderReaderRouteMeta(state.currentReaderSnapshot || {});
    syncSelectionControls();
  } catch (error){
    renderFolderAssignmentControl();
    window.alert(String(error?.message || error || "Failed to update folder binding."));
  } finally {
    if (select) select.disabled = false;
  }
}

function toggleSidebar(){
  state.sidebarExpanded = !state.sidebarExpanded;
  writeUiPrefs();
  applyUiState();
}

function toggleDensity(){
  state.density = state.density === "compact" ? "cozy" : "compact";
  writeUiPrefs();
  applyUiState();
}

function toggleLayout(){
  state.layout = state.layout === "wide" ? "focused" : "wide";
  writeUiPrefs();
  applyUiState();
}

function focusSearch(){
  $("#q")?.focus();
}

async function renderRoute(opts = {}){
  const route = parseHash();
  if (route.name === "read") {
    await renderReader(route.snapshotId);
    return;
  }
  await renderList(route.view, route.folderId, {
    ...opts,
    chatId: route.chatId,
    snapshotId: route.snapshotId,
  });
}

function boot(){
  readUiPrefs();
  applyUiState();

  $("#refreshBtn")?.addEventListener("click", () => {
    state.rowsCache = null;
    state.folderCatalog = [];
    state.folderBindingsByChat = {};
    renderRoute({ force: true }).catch(console.error);
  });

  $("#closeBtn")?.addEventListener("click", () => window.close());
  $("#openReaderTabBtn")?.addEventListener("click", openSelectedReaderTab);
  $("#sidebarToggleBtn")?.addEventListener("click", toggleSidebar);
  $("#sidebarCollapseBtn")?.addEventListener("click", toggleSidebar);
  $("#topSidebarBtn")?.addEventListener("click", toggleSidebar);
  $("#focusSearchBtn")?.addEventListener("click", focusSearch);
  $("#densityBtn")?.addEventListener("click", toggleDensity);
  $("#layoutBtn")?.addEventListener("click", toggleLayout);
  $("#folderAssignSelect")?.addEventListener("change", () => {
    handleFolderAssignChange().catch(console.error);
  });

  $("#q")?.addEventListener("input", () => {
    const route = parseHash();
    if (route.name === "list") renderList(route.view, route.folderId).catch(console.error);
  });

  window.addEventListener("hashchange", () => renderRoute().catch(console.error));

  if (!location.hash) location.hash = "#/saved";
  renderRoute().catch(console.error);
}

boot();
