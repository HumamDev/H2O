// @version 2.5.7
"use strict";

const W = window; // used by 0D3e studioHost bridge

const MSG_ARCHIVE = "h2o-ext-archive:v1";
const LIST_ROW_OPS = ["listWorkbenchRows"];
const CHAT_ID_OPS = ["listAllChatIds", "listChatIds"];
const FOLDER_LIST_OPS = ["getFoldersList"];
const FOLDER_BINDING_OPS = ["resolveFolderBindings"];
const FOLDER_SET_OPS = ["setFolderBinding"];
const LABEL_CATALOG_OPS = ["getLabelsCatalog"];
const CATEGORY_CATALOG_OPS = ["getCategoriesCatalog"];
const CATEGORY_SET_OPS = ["setSnapshotCategory"];
const CATEGORY_RECLASSIFY_OPS = ["reclassifySnapshotCategory"];
const FOLDER_FILTER_NONE = "__none__";
const UI_PREFS_KEY = "h2o:archiveWorkbench:ui:vNext";
const EDIT_OVERRIDES_KEY = "h2o:archiveWorkbench:editOverrides:v1";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  rowsCache: null,
  folderCatalog: [],
  labelCatalog: [],
  categoryCatalog: [],
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
  lastTagFilter: "",
  renderToken: 0,
};

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function studioHostUnmount(reason = "studio:unmount") {
  try { W.H2O?.studioHost?.unmount?.(reason); } catch {}
}

function resolveSnapshotTurnCreateTime(snap, turn, idx0){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const i1 = idx0 + 1;

  const directCandidates = [
    turn?.createTime,
    turn?.create_time,
    turn?.ts,
    turn?.timestamp,
    turn?.messageCreateTime,
    turn?.message_create_time
  ];

  for (const v of directCandidates){
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const maps = [
    meta.turnTimestamps,
    meta.turnCreateTimes,
    meta.messageTimestamps,
    meta.messageCreateTimes,
    meta.timestamps
  ];

  for (const map of maps){
    if (!map || typeof map !== "object") continue;
    const candidates = [
      map[String(turn?.turnIdx || i1)],
      map[i1],
      map[idx0]
    ];
    for (const v of candidates){
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return 0;
}

function stampReplayTurnMeta(host, frame, createTime, turnNo){
  const ct = Number(createTime || 0);
  const tn = Number(turnNo || 0);

  if (tn > 0){
    try { host?.setAttribute("data-h2o-turn-no", String(tn)); } catch {}
    try { frame?.setAttribute("data-h2o-turn-no", String(tn)); } catch {}
  }

  if (ct > 0){
    try { host?.setAttribute("data-h2o-create-time", String(ct)); } catch {}
    try { frame?.setAttribute("data-h2o-create-time", String(ct)); } catch {}
  }
}


// ─── Edit-override persistence ────────────────────────────────────────────────
// Stores user edits keyed by `${snapshotId}:${turnIdx}` in localStorage.
// Extension-page localStorage is isolated to the extension origin, so these
// overrides persist across Studio sessions but never leak to chatgpt.com.

function editOverrideKey(snapshotId, turnIdx){
  return `${EDIT_OVERRIDES_KEY}:${snapshotId}:${String(turnIdx)}`;
}

function getEditOverride(snapshotId, turnIdx){
  try { return localStorage.getItem(editOverrideKey(snapshotId, turnIdx)) ?? null; } catch { return null; }
}

function setEditOverride(snapshotId, turnIdx, text){
  try { localStorage.setItem(editOverrideKey(snapshotId, turnIdx), String(text)); return true; } catch { return false; }
}

function deleteEditOverridesForSnapshot(snapshotId){
  try {
    const prefix = `${EDIT_OVERRIDES_KEY}:${snapshotId}:`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
}

// Persists an edit into the extension-stored snapshot so exported bundles
// reflect what the user sees. Fire-and-forget; localStorage override remains
// the authoritative source for the current Studio session.
function persistEditToExtensionSnapshot(snapshotId, turnIdx, newText){
  const snap = state.currentReaderSnapshot;
  if (!snap || String(snap.snapshotId || "") !== String(snapshotId || "")) return;
  const messages = Array.isArray(snap.messages) ? snap.messages : [];
  const targetOrder = Number(turnIdx) - 1; // turnIdx is 1-based over all turns
  const nowStr = new Date().toISOString();
  const editedMessages = messages.map((msg) => {
    if (Number(msg.order) !== targetOrder) return { ...msg };
    const originalText = msg.originalText !== undefined ? msg.originalText : String(msg.text || "");
    return { ...msg, text: newText, editedAt: nowStr, originalText };
  });
  // Keep in-memory snapshot current so subsequent edits in this session build on the
  // correct state (each edit would otherwise use the original captured text as base).
  state.currentReaderSnapshot = { ...snap, messages: editedMessages };
  const meta = {
    ...(snap.meta && typeof snap.meta === "object" ? snap.meta : {}),
    updatedAt: nowStr,
  };
  callArchive("captureSnapshot", {
    chatId: String(snap.chatId || ""),
    messages: editedMessages,
    meta,
  }).catch(() => {});
}

// ─── Delete-confirm state ─────────────────────────────────────────────────────
// Two-click pattern: first click arms the confirm state (highlighted button +
// 3-second timeout), second click within that window executes the delete.

const DELETE_ICON_HTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l.8 9.1a.6.6 0 0 0 .6.9h7.2a.6.6 0 0 0 .6-.9L13 4"/></svg>`;

const deleteConfirm = {
  chatId: "",
  snapshotId: "",
  articleEl: null,
  timer: null,
};

function armDeleteConfirm(chatId, snapshotId, articleEl, btnEl){
  clearDeleteConfirm();
  deleteConfirm.chatId = chatId;
  deleteConfirm.snapshotId = snapshotId;
  deleteConfirm.articleEl = articleEl;
  articleEl.classList.add("wbHistoryRow--deleting");
  btnEl.textContent = "Delete?";
  btnEl.classList.add("wbDeleteBtn--armed");
  deleteConfirm.timer = setTimeout(() => clearDeleteConfirm(), 3000);
}

function clearDeleteConfirm(){
  clearTimeout(deleteConfirm.timer);
  const el = deleteConfirm.articleEl;
  if (el){
    el.classList.remove("wbHistoryRow--deleting");
    const btn = el.querySelector(".wbDeleteBtn");
    if (btn){ btn.innerHTML = DELETE_ICON_HTML; btn.classList.remove("wbDeleteBtn--armed"); }
  }
  deleteConfirm.chatId = "";
  deleteConfirm.snapshotId = "";
  deleteConfirm.articleEl = null;
  deleteConfirm.timer = null;
}

async function executeDeleteChat(chatId, snapshotId, articleEl){
  clearDeleteConfirm();
  articleEl.classList.add("wbHistoryRow--removing");

  try {
    // Attempt canonical deleteAllSnapshots op first, fall back to deleteSnapshot.
    let deleted = false;
    try {
      await callArchive("deleteAllSnapshots", { chatId });
      deleted = true;
    } catch {
      try { await callArchive("deleteSnapshot", { snapshotId, chatId }); deleted = true; } catch {}
    }

    // Always remove edit overrides for this snapshot locally
    deleteEditOverridesForSnapshot(snapshotId);

    // Remove from rows cache
    if (Array.isArray(state.rowsCache)){
      state.rowsCache = state.rowsCache.filter((r) => r.chatId !== chatId);
    }

    // Animate out then remove the DOM row
    await new Promise((res) => setTimeout(res, 260));
    articleEl.remove();

    // If the deleted chat was open in the reader, navigate back to list
    if (state.selectedChatId === chatId || state.currentReaderSnapshot?.chatId === chatId){
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      state.currentReaderSnapshot = null;
      location.hash = "#/saved";
    } else {
      // Refresh counts in sidebar
      const route = parseHash();
      renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
      renderSidebarChatList(state.rowsCache || [], route.view, state.lastFolderId);
      syncSelectionControls();
    }
  } catch (err){
    articleEl.classList.remove("wbHistoryRow--removing");
    console.warn("[Studio] Delete failed:", err);
  }
}

// ─── Turn edit UI ─────────────────────────────────────────────────────────────

function extractTurnPlaintext(frameEl){
  // Walk the frame element and extract readable text, preserving code blocks
  // with newlines so the edit textarea is usable.
  try {
    const clone = frameEl.cloneNode(true);
    // Replace code blocks with fenced markdown so edits round-trip sensibly
    clone.querySelectorAll("pre code, pre").forEach((pre) => {
      const lang = pre.className?.match(/language-(\S+)/)?.[1] || "";
      const text = pre.textContent || "";
      const placeholder = document.createTextNode(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`);
      pre.replaceWith(placeholder);
    });
    return (clone.textContent || "").trim();
  } catch {
    return (frameEl.textContent || "").trim();
  }
}

function mountEditTextarea(hostEl, snapshotId, turnIdx, originalText, onSave, onCancel){
  hostEl.innerHTML = "";
  hostEl.classList.add("wbTurn--editing");

  const wrap = document.createElement("div");
  wrap.className = "wbEditWrap";

  const textarea = document.createElement("textarea");
  textarea.className = "wbEditTextarea";
  textarea.value = originalText;
  textarea.rows = Math.min(Math.max(originalText.split("\n").length + 2, 4), 28);
  textarea.setAttribute("spellcheck", "true");
  textarea.setAttribute("autocomplete", "off");

  const actions = document.createElement("div");
  actions.className = "wbEditActions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "wbBtn wbBtnPrimary wbEditSaveBtn";
  saveBtn.textContent = "Save edit";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "wbBtn wbEditCancelBtn";
  cancelBtn.textContent = "Cancel";

  actions.append(saveBtn, cancelBtn);
  wrap.append(textarea, actions);
  hostEl.appendChild(wrap);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

  saveBtn.addEventListener("click", () => {
    const newText = textarea.value;
    setEditOverride(snapshotId, turnIdx, newText);
    persistEditToExtensionSnapshot(snapshotId, turnIdx, newText);
    onSave(newText);
  });
  cancelBtn.addEventListener("click", () => {
    onCancel();
  });

  // Ctrl/Cmd+Enter saves
  textarea.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter"){
      ev.preventDefault();
      saveBtn.click();
    }
    if (ev.key === "Escape"){
      ev.preventDefault();
      cancelBtn.click();
    }
  });

  return { textarea, saveBtn, cancelBtn };
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

  const sidebarOpen = !!state.sidebarExpanded;
  const sidebarButtons = ["#sidebarCollapseBtn", "#railSidebarBtn"];
  sidebarButtons.forEach((selector) => {
    const btn = $(selector);
    if (!btn) return;
    btn.setAttribute("aria-expanded", sidebarOpen ? "true" : "false");
  });
  $(".wbRail")?.setAttribute("aria-hidden", sidebarOpen ? "true" : "false");
  $("#studioSidebar")?.setAttribute("aria-hidden", sidebarOpen ? "false" : "true");
  const collapseBtn = $("#sidebarCollapseBtn");
  if (collapseBtn) collapseBtn.tabIndex = sidebarOpen ? 0 : -1;
  const railBtn = $("#railSidebarBtn");
  if (railBtn) railBtn.tabIndex = sidebarOpen ? -1 : 0;

  const closeBtn = $("#closeBtn");
  if (closeBtn){
    const isReader = !!state.currentReaderSnapshot;
    closeBtn.setAttribute("aria-label", isReader ? "Close reader" : "Close Studio window");
    closeBtn.setAttribute("title", isReader ? "Close reader" : "Close window");
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
  const hash = String(location.hash || "");
  if (!hash && history.state?.h2oStudioReader){
    const activeSnapshotId = String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
    if (activeSnapshotId) return { name: "read", snapshotId: activeSnapshotId };
  }

  const raw = (hash || "#/saved").replace(/^#/, "");
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

function normalizeSafeMarkdownHref(rawHref){
  const href = String(rawHref || "").trim();
  if (!href || /[\u0000-\u001F\u007F\s]/.test(href)) return "";

  try {
    const parsed = new URL(href);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") return href;
  } catch {}

  return "";
}

// Inline markdown → HTML. Handles links, bold, italic, inline code, plain text.
// All plain-text segments are HTML-escaped via esc(). Handles orphaned markers
// gracefully — an unmatched ` or * is consumed as literal text.
function renderInlineMarkdown(text){
  let s = String(text || "");
  let out = "";
  while (s.length > 0){
    // Inline code: `code`
    if (s[0] === "`"){
      const end = s.indexOf("`", 1);
      if (end > 0){
        out += `<code>${esc(s.slice(1, end))}</code>`;
        s = s.slice(end + 1);
        continue;
      }
    }
    // Link: [label](https://example.com). Unsafe hrefs stay literal text.
    if (s[0] === "["){
      const labelEnd = s.indexOf("]");
      if (labelEnd > 0 && s[labelEnd + 1] === "("){
        const hrefEnd = s.indexOf(")", labelEnd + 2);
        if (hrefEnd > labelEnd + 2){
          const label = s.slice(1, labelEnd);
          const rawHref = s.slice(labelEnd + 2, hrefEnd);
          const href = normalizeSafeMarkdownHref(rawHref);
          if (href){
            out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(label)}</a>`;
            s = s.slice(hrefEnd + 1);
            continue;
          }
        }
      }
      out += esc("[");
      s = s.slice(1);
      continue;
    }
    // Bold: **text** — check before single * to avoid false matches
    if (s.startsWith("**")){
      const end = s.indexOf("**", 2);
      if (end > 2){
        out += `<strong>${renderInlineMarkdown(s.slice(2, end))}</strong>`;
        s = s.slice(end + 2);
        continue;
      }
    }
    // Italic: *text* (single asterisk, not a double)
    if (s[0] === "*" && s[1] !== "*"){
      const end = s.indexOf("*", 1);
      if (end > 1){
        out += `<em>${renderInlineMarkdown(s.slice(1, end))}</em>`;
        s = s.slice(end + 1);
        continue;
      }
    }
    // Italic: _text_ (underscore style)
    if (s[0] === "_" && s[1] !== "_"){
      const end = s.indexOf("_", 1);
      if (end > 1){
        out += `<em>${renderInlineMarkdown(s.slice(1, end))}</em>`;
        s = s.slice(end + 1);
        continue;
      }
    }
    // Plain text — consume up to the next potential marker character
    const nextMarker = s.search(/[`*_\[]/);
    if (nextMarker > 0){
      const skipImageMarker = s[nextMarker] === "[" && s[nextMarker - 1] === "!";
      const end = skipImageMarker ? nextMarker + 1 : nextMarker;
      out += esc(s.slice(0, end));
      s = s.slice(end);
    } else {
      out += esc(s); // no more markers, consume the rest
      break;
    }
  }
  return out;
}

function countMarkdownIndent(line){
  let count = 0;
  for (const ch of String(line || "")){
    if (ch === " ") count += 1;
    else if (ch === "\t") count += 4;
    else break;
  }
  return count;
}

function parseMarkdownListLine(line){
  const match = String(line || "").match(/^([ \t]*)([-*+]|\d+\.)[ \t]+(.+)$/);
  if (!match) return null;
  return {
    indent: countMarkdownIndent(match[1]),
    type: /^\d+\.$/.test(match[2]) ? "ol" : "ul",
    text: match[3],
  };
}

function renderMarkdownList(lines, start, baseIndent, listType){
  const tag = listType === "ol" ? "ol" : "ul";
  const items = [];
  let i = start;

  while (i < lines.length){
    const row = parseMarkdownListLine(lines[i]);
    if (!row || row.indent !== baseIndent || row.type !== listType) break;

    const parts = [renderInlineMarkdown(row.text)];
    i++;

    while (i < lines.length){
      if (String(lines[i] || "").trim() === "") break;

      const child = parseMarkdownListLine(lines[i]);
      if (!child || child.indent <= baseIndent) break;

      const nested = renderMarkdownList(lines, i, child.indent, child.type);
      parts.push(nested.html);
      i = nested.next;
    }

    items.push(`<li>${parts.join("")}</li>`);
  }

  return { html: `<${tag}>${items.join("")}</${tag}>`, next: i };
}

function splitMarkdownTableRow(line){
  let src = String(line || "").trim();
  if (!src.includes("|")) return [];
  if (src.startsWith("|")) src = src.slice(1);
  if (src.endsWith("|")) src = src.slice(0, -1);

  const cells = [];
  let cell = "";
  for (let i = 0; i < src.length; i += 1){
    const ch = src[i];
    if (ch === "\\" && src[i + 1] === "|"){
      cell += "|";
      i++;
      continue;
    }
    if (ch === "|"){
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function parseMarkdownTableAlign(cell){
  const marker = String(cell || "").replace(/\s+/g, "");
  if (!/^:?-{3,}:?$/.test(marker)) return null;
  if (marker.startsWith(":") && marker.endsWith(":")) return "center";
  if (marker.endsWith(":")) return "right";
  if (marker.startsWith(":")) return "left";
  return "";
}

function parseMarkdownTableStart(lines, start){
  if (start + 1 >= lines.length) return null;
  const header = splitMarkdownTableRow(lines[start]);
  const delimiter = splitMarkdownTableRow(lines[start + 1]);
  if (header.length < 2 || delimiter.length !== header.length) return null;

  const aligns = delimiter.map(parseMarkdownTableAlign);
  if (aligns.some((align) => align === null)) return null;
  return { header, aligns };
}

function renderMarkdownTable(lines, start){
  const parsed = parseMarkdownTableStart(lines, start);
  if (!parsed) return null;

  const { header, aligns } = parsed;
  const columnCount = header.length;
  let i = start + 2;
  const bodyRows = [];

  while (i < lines.length){
    if (String(lines[i] || "").trim() === "") break;
    const cells = splitMarkdownTableRow(lines[i]);
    if (cells.length < 2) break;
    bodyRows.push(cells.slice(0, columnCount));
    i++;
  }

  const alignAttr = (idx) => aligns[idx] ? ` style="text-align:${aligns[idx]}"` : "";
  const renderCell = (tag, value, idx) => (
    `<${tag}${alignAttr(idx)}>${renderInlineMarkdown(value || "")}</${tag}>`
  );
  const head = `<thead><tr>${header.map((cell, idx) => renderCell("th", cell, idx)).join("")}</tr></thead>`;
  const body = `<tbody>${bodyRows.map((row) => {
    const cells = Array.from({ length: columnCount }, (_, idx) => row[idx] || "");
    return `<tr>${cells.map((cell, idx) => renderCell("td", cell, idx)).join("")}</tr>`;
  }).join("")}</tbody>`;

  return { html: `<table>${head}${body}</table>`, next: i };
}

// Full markdown → HTML for archive message text.
// Handles: fenced code blocks, headings (h1–h3), horizontal rules, blockquotes,
// tables, nested unordered/ordered lists, paragraphs, and inline formatting.
// Stays close to the Mobile Studio renderer while adding Browser quote support.
function renderTextAsChatGPTBlocks(text){
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length){
    const line = lines[i];

    // Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
    if (fenceMatch){
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)){
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      const langBadge = lang ? `<div class="wbCodeLang">${esc(lang)}</div>` : "";
      out.push(`<div class="wbCodeBlock">${langBadge}<pre><code>${esc(codeLines.join("\n"))}</code></pre></div>`);
      continue;
    }

    // ATX heading (# ## ###)
    const headingMatch = line.match(/^(#{1,3})[ \t]+(.+?)[ \t]*$/);
    if (headingMatch){
      const level = Math.min(headingMatch[1].length, 3);
      out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule (--- *** ___ as standalone line)
    if (/^[-*_]{3,}\s*$/.test(line.trim())){
      out.push(`<hr>`);
      i++;
      continue;
    }

    const table = renderMarkdownTable(lines, i);
    if (table){
      out.push(table.html);
      i = table.next;
      continue;
    }

    // Blockquote (> quote). Reuse this renderer for quoted markdown content.
    if (/^[ \t]{0,3}>[ \t]?/.test(line)){
      const quoteLines = [];
      while (i < lines.length && /^[ \t]{0,3}>[ \t]?/.test(lines[i])){
        quoteLines.push(lines[i].replace(/^[ \t]{0,3}>[ \t]?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderTextAsChatGPTBlocks(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const listRow = parseMarkdownListLine(line);
    if (listRow){
      const list = renderMarkdownList(lines, i, listRow.indent, listRow.type);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // Blank line
    if (line.trim() === ""){
      i++;
      continue;
    }

    // Paragraph — collect lines until a blank line or a block-level element starts
    const paraLines = [];
    while (i < lines.length){
      const l = lines[i];
      if (l.trim() === "") break;
      if (/^(`{3,}|~{3,})/.test(l)) break;
      if (/^#{1,3}[ \t]/.test(l)) break;
      if (/^[-*_]{3,}\s*$/.test(l.trim())) break;
      if (parseMarkdownTableStart(lines, i)) break;
      if (/^[ \t]{0,3}>[ \t]?/.test(l)) break;
      if (parseMarkdownListLine(l)) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0){
      out.push(`<p>${renderInlineMarkdown(paraLines.join(" "))}</p>`);
    }
  }

  return out.join("") || `<p></p>`;
}

function isConversationTurnNode(node){
  if (!(node instanceof Element)) return false;
  const testid = String(node.getAttribute("data-testid") || "").trim();
  return testid === "conversation-turn" || testid.startsWith("conversation-turn-");
}

function findConversationTurnElement(root){
  if (!root) return null;
  const direct = [...(root.children || [])].find((node) => isConversationTurnNode(node));
  if (direct) return direct;
  return root.querySelector?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || null;
}

function findRoleHostInTurn(turnEl, preferredRole = ""){
  if (!(turnEl instanceof Element)) return null;
  const preferred = normalizeRole(preferredRole || "");
  if (preferredRole){
    const exact = turnEl.querySelector?.(`[data-message-author-role="${preferred}"]`) || null;
    if (exact) return exact;
  }
  return turnEl.querySelector?.("[data-message-author-role]") || null;
}

function inferTurnRole(turnEl, fallbackRole = "assistant"){
  const roleHost = findRoleHostInTurn(turnEl, fallbackRole);
  const raw =
    roleHost?.getAttribute?.("data-message-author-role") ||
    turnEl?.getAttribute?.("data-turn") ||
    fallbackRole;
  return normalizeRole(raw);
}

function extractPlaintextFromHtml(htmlRaw){
  const html = String(htmlRaw || "").trim();
  if (!html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return normalizeText(tpl.content.textContent || "");
}

const STALE_REPLAY_SUBTREE_SELECTORS = [
  ".h2o-cold-layer",
  '[data-h2o-cold-layer="1"]',
  '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mnmp-panel"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mnmp-col"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mm-root"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mm-minimap"][data-cgxui-owner="mnmp"]',
  ".cgxui-mm-root",
  ".cgxui-mm-minimap",
  ".cgxui-mm-col",
  ".cgxui-mm-wrap",
  ".cgxui-mm-btn",
  ".cgxui-mm-qbtn",
  ".cgxui-mm-dotrow",
  ".cgxui-mm-count",
  ".cgxui-mm-toggle",
  ".cgxui-mm-aux",
  ".cgxui-mm-counter",
  ".cgxui-mnmp-root",
  ".cgxui-mnmp-minimap",
  ".cgxui-mnmp-col",
  ".cgxui-mnmp-wrap",
  ".cgxui-mnmp-btn",
  ".cgxui-mnmp-qbtn",
  ".cgxui-mnmp-dotrow",
  ".cgxui-mnmp-count",
  ".cgxui-mnmp-toggle",
  ".cgxui-mnmp-aux",
  ".cgxui-mnmp-counter",
  '[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]',
  ".cgxui-atns-answer-title",
  ".cgxui-atns-answer-title-text",
  ".cgxui-atns-answer-title-label",
  ".cgxui-atns-answer-title-badge",
  ".cgxui-atns-answer-title-icon",
  '[data-cgxui-qts-bar][data-cgxui-owner="qts"]',
  '[data-cgxui-qts-inline][data-cgxui-owner="qts"]',
  '[data-cgxui-ats-bar][data-cgxui-owner="ats"]',
  '[data-cgxui-ats-inline][data-cgxui-owner="ats"]',
  '[data-cgxui="qbig-num"][data-cgxui-owner="qbig"]',
  '[data-cgxui="ansn-abig"][data-cgxui-owner="ansn"]',
  '[data-cgxui="mrnc-marks"][data-cgxui-owner="mrnc"]',
  '[data-cgxui="mrnc-gutter"][data-cgxui-owner="mrnc"]',
  '[data-cgxui="mrnc-gutlane"][data-cgxui-owner="mrnc"]',
  ".cgxui-qts-ts",
  ".cgxui-ats-ts",
  ".chatgpt-timestamp",
  ".cgxui-qbig-number",
  ".cgxui-ansn-big-number",
  ".cgxui-qswr-quoteBox",
  ".cgxui-qswr-toggle",
  ".cgxui-qswr-toggle-top",
  ".cgxui-qswr-toggle-row",
  '[aria-label="Response actions"][role="group"]',
  '[aria-label="Your message actions"][role="group"]'
];

const REPLAY_UNWRAP_SELECTORS = [
  ".cgxui-qswr",
  '[data-cgxui="scbn-band"][data-cgxui-owner="scbn"]'
];

const STRIP_REPLAY_ATTRS = new Set([
  "data-ho-ignore",
  "data-cgxui-at-hidden",
  "data-cgxui-chat-geometry",
  "data-cgxui-chat-page-divider",
  "data-cgxui-chat-page-hidden",
  "data-cgxui-chat-page-no-answer",
  "data-cgxui-chat-page-no-answer-question-hidden",
  "data-cgxui-chat-page-question-hidden",
  "data-cgxui-chat-page-title-item",
  "data-cgxui-chat-page-title-list",
  "data-cgxui-chat-page-title-state",
  "data-cgxui-chat-page-title-wrapper",
  "data-cgxui-page-dividers",
  "data-cgxui-page-label-style",
  "data-h2o-archive-cold",
  "data-h2o-archive-msg-idx",
  "data-h2o-archive-pending",
  "data-h2o-cold",
  "data-h2o-cold-idx",
  "data-h2o-cold-turn-idx",
  "data-h2o-cold-layer"
]);

const STRIP_REPLAY_ATTR_PATTERNS = [
  /^data-h2o-x1n-sig$/i,
  /^data-h2o-x1n-csig$/i,
  /^data-h2o-qbg-sig$/i,
  /^data-h2o-x1bg-sig$/i,
  /^data-h2o-qbig-sig-num$/i,
  /^data-h2o-qbig-sig-pos$/i,
  /^data-h2o-qbig-hostfb$/i,
  /^data-cgxui-[^-]+-pre$/i,
  /^data-cgxui-[^-]+-bound$/i,
  /^data-cgxui-[^-]+-done$/i,
  /^data-cgxui-[^-]+-sig(?:-.+)?$/i
];

function shouldStripReplayAttr(el, attrName){
  const name = String(attrName || "").toLowerCase();
  if (!name) return false;
  if (STRIP_REPLAY_ATTRS.has(name)) return true;
  if (STRIP_REPLAY_ATTR_PATTERNS.some((re) => re.test(name))) return true;
  if (name === "data-ho-qwrap-done"){
    const hasPreservedQwrap =
      !!el?.querySelector?.(".cgxui-qswr, [data-h2o-qwrap-id], [data-ho-qwrap-id]");
    return !hasPreservedQwrap;
  }
  return false;
}

function unwrapReplayNode(node){
  if (!(node instanceof Element)) return;
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild){
    parent.insertBefore(node.firstChild, node);
  }
  node.remove();
}

function scrubReplayNode(root){
  if (!(root instanceof Element)) return;

  root.querySelectorAll(STALE_REPLAY_SUBTREE_SELECTORS.join(",")).forEach((node) => {
    try { node.remove(); } catch {}
  });
  root.querySelectorAll(REPLAY_UNWRAP_SELECTORS.join(",")).forEach((node) => {
    try { unwrapReplayNode(node); } catch {}
  });

  const all = [root, ...root.querySelectorAll("*")];
  all.forEach((el) => {
    for (const attr of [...el.attributes]){
      const name = String(attr.name || "").toLowerCase();
      if (name.startsWith("on")){
        try { el.removeAttribute(attr.name); } catch {}
        continue;
      }
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(String(attr.value || ""))){
        try { el.removeAttribute(attr.name); } catch {}
        continue;
      }
      if (shouldStripReplayAttr(el, attr.name)){
        try { el.removeAttribute(attr.name); } catch {}
      }
    }

    if (el.tagName === "A"){
      try {
        const href = el.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)){
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer noopener");
        }
      } catch {}
    }
  });
}

function sanitizeRichTurnElement(htmlRaw){
  const html = String(htmlRaw || "").trim();
  if (!html) return null;

  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  tpl.content.querySelectorAll("script,link,iframe,object,embed,style").forEach((bad) => {
    try { bad.remove(); } catch {}
  });

  const turnEl = findConversationTurnElement(tpl.content);
  if (!turnEl) return null;

  const cleanTurn = turnEl.cloneNode(true);
  scrubReplayNode(cleanTurn);
  return cleanTurn;
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

    const item = { turnIdx, role, outerHTML };

    const createTime = Number(row.createTime ?? row.create_time ?? 0);
    const userCreateTime = Number(row.userCreateTime ?? row.user_create_time ?? 0);
    const assistantCreateTime = Number(row.assistantCreateTime ?? row.assistant_create_time ?? 0);
    const userMessageId = String(row.userMessageId || row.user_message_id || "").trim();
    const assistantMessageId = String(row.assistantMessageId || row.assistant_message_id || "").trim();

    if (Number.isFinite(createTime) && createTime > 0) item.createTime = createTime;
    if (Number.isFinite(userCreateTime) && userCreateTime > 0) item.userCreateTime = userCreateTime;
    if (Number.isFinite(assistantCreateTime) && assistantCreateTime > 0) item.assistantCreateTime = assistantCreateTime;
    if (userMessageId) item.userMessageId = userMessageId;
    if (assistantMessageId) item.assistantMessageId = assistantMessageId;
    if (row.messageTimes && typeof row.messageTimes === "object") item.messageTimes = { ...row.messageTimes };

    out.push(item);
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

const STUDIO_MM_COLOR_ORDER = ["blue", "red", "green", "gold", "sky", "pink", "purple", "orange"];

function normalizeMiniMapColorToken(raw){
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("gold") || value.includes("yellow") || value === "#ffd700" || value === "#f7d34a") return "gold";
  if (value.includes("blue") || value === "#66b5ff" || value === "#3a8bff") return "blue";
  if (value.includes("red") || value === "#f87171" || value === "#ff4a4a") return "red";
  if (value.includes("green") || value === "#35c759" || value === "#31d158") return "green";
  if (value.includes("purple") || value === "#a78bfa" || value === "#a36bff") return "purple";
  if (value.includes("pink") || value === "#ff79c6" || value === "#ff71c6") return "pink";
  if (value.includes("orange") || value === "#fb923c" || value === "#ffa63a") return "orange";
  if (value.includes("sky") || value === "#4cd3ff") return "sky";
  return "";
}

function resolveMiniMapTone(colors){
  const list = uniqStrings(colors || []);
  for (const color of list){
    const token = normalizeMiniMapColorToken(color);
    if (token) return token;
  }
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
  wrap.setAttribute("data-message-author-role", role);
  if (meta.messageId) wrap.setAttribute("data-message-id", String(meta.messageId));
  if (meta.turnId) wrap.setAttribute("data-turn-id", String(meta.turnId));
  if (meta.dir) wrap.setAttribute("dir", String(meta.dir));

  const bodyEl = document.createElement("div");
  bodyEl.className = "cgMsgBody";
  bodyEl.innerHTML = renderTextAsChatGPTBlocks(text);

  wrap.appendChild(bodyEl);

  if (meta.answerIdx && role === "assistant"){
    wrap.dataset.turnIdx = String(meta.answerIdx);
  }
  return wrap;
}

function buildCanonicalTurn(role, text, meta = {}){
  const turn = document.createElement("section");
  turn.className = `cgTurn cgTurn--${role} wbTurn wbTurn--fallback wbTurn--${role}`;
  turn.setAttribute("data-testid", meta.turnNo > 0 ? `conversation-turn-${meta.turnNo}` : "conversation-turn");
  turn.setAttribute("data-turn", role);

  const messageEl = buildCanonicalMessage(role, text, meta);
  if (role === "assistant" && meta.answerIdx > 0){
    turn.dataset.turnIdx = String(meta.answerIdx);
  }
  stampReplayTurnMeta(turn, messageEl, meta.createTime, meta.turnNo);
  turn.appendChild(messageEl);
  return { turn, messageEl };
}

function decorateReplayTurn(turnEl, messageEl, role, meta = {}){
  if (!(turnEl instanceof Element) || !(messageEl instanceof Element)) return;

  turnEl.classList.add("cgTurn", `cgTurn--${role}`, "wbTurn", "wbTurn--rich", `wbTurn--${role}`);
  if (!isConversationTurnNode(turnEl)){
    turnEl.setAttribute("data-testid", meta.turnNo > 0 ? `conversation-turn-${meta.turnNo}` : "conversation-turn");
  }
  if (!turnEl.getAttribute("data-turn")) turnEl.setAttribute("data-turn", role);
  if (role === "assistant" && meta.answerIdx > 0){
    turnEl.dataset.turnIdx = String(meta.answerIdx);
    try { messageEl.dataset.turnIdx = String(meta.answerIdx); } catch {}
  }
  if (meta.messageId && !messageEl.getAttribute("data-message-id")){
    messageEl.setAttribute("data-message-id", String(meta.messageId));
  }
  if (meta.turnId && !messageEl.getAttribute("data-turn-id")){
    messageEl.setAttribute("data-turn-id", String(meta.turnId));
  }
  stampReplayTurnMeta(turnEl, messageEl, meta.createTime, meta.turnNo);
}

function captureMessageRenderState(messageEl){
  if (!(messageEl instanceof Element)) return null;
  return {
    className: messageEl.className,
    innerHTML: messageEl.innerHTML,
    role: String(messageEl.getAttribute("data-message-author-role") || ""),
  };
}

function restoreMessageRenderState(messageEl, snapshot){
  if (!(messageEl instanceof Element) || !snapshot) return;
  if (typeof snapshot.className === "string") messageEl.className = snapshot.className;
  if (typeof snapshot.innerHTML === "string") messageEl.innerHTML = snapshot.innerHTML;
  if (snapshot.role) messageEl.setAttribute("data-message-author-role", snapshot.role);
}

function applyEditedMessageBody(messageEl, role, text){
  if (!(messageEl instanceof Element)) return;
  messageEl.innerHTML = "";
  messageEl.setAttribute("data-message-author-role", role);
  messageEl.classList.add("cgMsg", `cgMsg--${role}`, "cgMsg--edited");

  const bodyEl = document.createElement("div");
  bodyEl.className = "cgMsgBody";
  bodyEl.innerHTML = renderTextAsChatGPTBlocks(text);
  messageEl.appendChild(bodyEl);
}

function attachAssistantEditButton(turnEl, messageEl, snapshotId, editKey){
  if (!(turnEl instanceof Element) || !(messageEl instanceof Element)) return;

  const sid = String(snapshotId || "");
  try { turnEl.querySelector(":scope > .wbEditBtn")?.remove(); } catch {}

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "wbEditBtn";
  editBtn.setAttribute("aria-label", "Edit this answer");
  editBtn.setAttribute("title", "Edit answer (saved locally)");
  editBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5Z"/></svg>`;

  editBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (turnEl.classList.contains("wbTurn--editing")) return;

    const visibleState = captureMessageRenderState(messageEl);
    const currentText = extractTurnPlaintext(messageEl);

    turnEl.classList.add("wbTurn--editing");
    mountEditTextarea(
      messageEl,
      sid,
      editKey,
      currentText,
      (newText) => {
        turnEl.classList.remove("wbTurn--editing");
        turnEl.classList.add("wbTurn--edited");
        applyEditedMessageBody(messageEl, "assistant", newText);

        try {
          W.H2O?.obs?.withSuppressed?.("studio:edit-save", () => {}, { flush: true });
          W.H2O?.index?.refresh?.("studio:edit-save");
        } catch {}
      },
      () => {
        turnEl.classList.remove("wbTurn--editing");
        restoreMessageRenderState(messageEl, visibleState);

        try {
          W.H2O?.obs?.withSuppressed?.("studio:edit-cancel", () => {}, { flush: true });
          W.H2O?.index?.refresh?.("studio:edit-cancel");
        } catch {}
      }
    );
  });

  turnEl.appendChild(editBtn);
}

function buildCanonicalConversation(container, snap){
  const messages = Array.isArray(snap?.messages) ? snap.messages : [];
  const assistantTurns = [];
  let answerIdx = 0;
  let turnNo = 0;

  for (const row of messages){
    const role = normalizeRole(row?.role);
    const text = String(row?.text || "");
    turnNo += 1;

    const rowCreateTime = resolveSnapshotTurnCreateTime(snap, row, turnNo - 1);
    const nextAnswerIdx = role === "assistant" ? (answerIdx + 1) : 0;
    const { turn, messageEl } = buildCanonicalTurn(role, text, {
      turnNo,
      answerIdx: nextAnswerIdx,
      createTime: rowCreateTime,
      messageId: row?.messageId || row?.id || "",
      turnId: row?.turnId || "",
      dir: row?.dir || "",
    });
    if (role === "assistant"){
      answerIdx = nextAnswerIdx;
      attachAssistantEditButton(turn, messageEl, snap?.snapshotId || "", turnNo);
      assistantTurns.push(turn);
    }
    container.appendChild(turn);
  }

  return assistantTurns;
}

function mountRichTurns(container, richTurns, snapshotId, snap){
  const sid = String(snapshotId || "");
  const normalized = normalizeRichTurns(richTurns);
  const assistantHosts = [];
  let assistantIdx = 0;

  for (let i = 0; i < normalized.length; i += 1){
    const turn = normalized[i];
    const turnNo = Number(turn.turnIdx || (i + 1)) || (i + 1);
    const createTime = resolveSnapshotTurnCreateTime(snap, turn, i);
    let host = sanitizeRichTurnElement(turn.outerHTML);
    let role = normalizeRole(turn.role);
    let messageEl = host ? findRoleHostInTurn(host, role) : null;

    if (host && messageEl){
      role = inferTurnRole(host, role);
    } else {
      const fallback = buildCanonicalTurn(role, extractPlaintextFromHtml(turn.outerHTML), {
        turnNo,
        answerIdx: role === "assistant" ? (assistantIdx + 1) : 0,
        createTime,
        messageId: role === "assistant" ? turn.assistantMessageId : turn.userMessageId,
      });
      host = fallback.turn;
      messageEl = fallback.messageEl;
    }

    if (!(host instanceof Element) || !(messageEl instanceof Element)) continue;

    const answerIdx = role === "assistant" ? (assistantIdx + 1) : 0;
    decorateReplayTurn(host, messageEl, role, {
      turnNo,
      answerIdx,
      createTime,
      messageId: role === "assistant" ? turn.assistantMessageId : turn.userMessageId,
    });

    const override = sid ? getEditOverride(sid, turn.turnIdx) : null;
    if (override !== null && role === "assistant"){
      host.classList.add("wbTurn--edited");
      applyEditedMessageBody(messageEl, role, override);
    }

    if (role === "assistant"){
      assistantIdx = answerIdx;
      attachAssistantEditButton(host, messageEl, sid, turn.turnIdx);
      assistantHosts.push(host);
    }

    container.appendChild(host);
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

function buildMiniMap(mm, turnEls, turnHighlightsRaw = [], scrollEl = null){
  const items = (Array.isArray(turnEls) ? turnEls : []).filter(Boolean);
  const highlightRows = normalizeTurnHighlights(turnHighlightsRaw);
  const highlightMap = new Map(highlightRows.map((row) => [Number(row.turnIdx), row.colors.slice()]));
  mm.textContent = "";
  mm.hidden = items.length === 0;
  if (!items.length) return;

  const chrome = document.createElement("div");
  chrome.className = "cgMMChrome";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "cgMMToggle";
  toggle.setAttribute("aria-expanded", "true");

  const pagePill = document.createElement("div");
  pagePill.className = "cgMMPagePill";

  const list = document.createElement("div");
  list.className = "cgMMList";

  const dial = document.createElement("button");
  dial.type = "button";
  dial.className = "cgMMDial";
  dial.title = "Toggle navigation colors";
  dial.innerHTML = '<span class="cgMMDialDot"></span>';

  const colorNav = document.createElement("div");
  colorNav.className = "cgMMColorNav is-open";

  chrome.appendChild(toggle);
  chrome.appendChild(pagePill);
  chrome.appendChild(list);
  chrome.appendChild(dial);
  chrome.appendChild(colorNav);
  mm.appendChild(chrome);

  const host = scrollEl || document.querySelector(".wbMain") || document.querySelector(".cgScroll") || null;
  const pairs = [];
  const colorTargets = new Map();
  const colorState = new Map();
  let rafId = 0;
  let activeIndex = 0;
  let collapsed = false;

  function jumpToIndex(nextIndex){
    const pair = pairs[nextIndex];
    if (!pair) return;
    pair.turnEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    try {
      pair.turnEl.animate(
        [{ backgroundColor: "rgba(255,215,0,.10)" }, { backgroundColor: "" }],
        { duration: 560 }
      );
    } catch {}
  }

  function refreshColorLabels(){
    colorNav.querySelectorAll(".cgMMColorBtn").forEach((btn) => {
      const token = String(btn.dataset.color || "");
      const targets = colorTargets.get(token) || [];
      const stateEntry = colorState.get(token) || { current: 0 };
      const total = targets.length;
      const current = total ? Math.max(1, Math.min(total, Number(stateEntry.current || 1))) : 0;
      btn.textContent = total ? `${current}/${total}` : "0/0";
      btn.hidden = total === 0;
    });
  }

  function setActiveByIndex(nextIndex){
    activeIndex = Math.max(0, Math.min(pairs.length - 1, Number(nextIndex || 0)));
    pairs.forEach((pair, idx) => {
      const active = idx === activeIndex;
      pair.button.classList.toggle("active", active);
      pair.button.setAttribute("aria-current", active ? "true" : "false");
      if (active) {
        try { pair.button.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
      }
    });
    toggle.textContent = `${activeIndex + 1}/${pairs.length}`;
    pagePill.textContent = `PAGE ${Math.max(1, Math.ceil((activeIndex + 1) / 25))}`;
    toggle.title = `Answer ${activeIndex + 1} of ${pairs.length}`;
  }

  function syncActive(){
    rafId = 0;
    if (!pairs.length) return;
    const hostRect = host?.getBoundingClientRect?.() || null;
    const probeY = hostRect ? (hostRect.top + Math.min(hostRect.height * 0.28, 180)) : (window.innerHeight * 0.33);
    let bestIndex = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    pairs.forEach((pair, idx) => {
      const rect = pair.turnEl?.getBoundingClientRect?.();
      if (!rect) return;
      const mid = rect.top + (rect.height * 0.5);
      const dist = Math.abs(mid - probeY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = idx;
      }
    });
    setActiveByIndex(bestIndex);
  }

  function queueSync(){
    if (rafId) return;
    rafId = requestAnimationFrame(syncActive);
  }

  items.forEach((turnEl, index) => {
    const answerIndex = index + 1;
    const turnIdx = Math.max(1, Math.floor(Number(turnEl?.dataset?.turnIdx || answerIndex) || answerIndex));
    const colors = highlightMap.get(answerIndex) || highlightMap.get(turnIdx) || [];
    const tone = resolveMiniMapTone(colors);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgMMBtn";
    button.dataset.index = String(answerIndex);
    if (tone) button.dataset.tone = tone;
    button.title = `Answer ${answerIndex}/${items.length}`;

    const num = document.createElement("span");
    num.className = "cgMMIndex";
    num.textContent = String(answerIndex);
    button.appendChild(num);
    appendMiniMapDots(button, colors);

    button.addEventListener("click", () => {
      setActiveByIndex(index);
      jumpToIndex(index);
      refreshColorLabels();
    });

    list.appendChild(button);
    pairs.push({ button, turnEl, turnIdx, colors, tone });

    uniqStrings(colors).forEach((color) => {
      const token = normalizeMiniMapColorToken(color);
      if (!token) return;
      const next = colorTargets.get(token) || [];
      next.push(index);
      colorTargets.set(token, next);
    });
  });

  STUDIO_MM_COLOR_ORDER.forEach((token) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cgMMColorBtn";
    btn.dataset.color = token;
    btn.dataset.tone = token;
    btn.title = `${token} navigation`;
    btn.addEventListener("click", () => {
      const targets = colorTargets.get(token) || [];
      if (!targets.length) return;
      const entry = colorState.get(token) || { current: 0 };
      entry.current = ((Number(entry.current || 0)) % targets.length) + 1;
      colorState.set(token, entry);
      const targetIndex = targets[entry.current - 1] ?? targets[0] ?? 0;
      setActiveByIndex(targetIndex);
      jumpToIndex(targetIndex);
      refreshColorLabels();
    });
    colorNav.appendChild(btn);
  });

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    chrome.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  dial.addEventListener("click", () => {
    colorNav.classList.toggle("is-open");
    chrome.classList.toggle("nav-open", colorNav.classList.contains("is-open"));
  });

  host?.addEventListener("scroll", queueSync, { passive: true });
  list.addEventListener("scroll", refreshColorLabels, { passive: true });
  window.addEventListener("resize", queueSync, { passive: true });
  setActiveByIndex(0);
  refreshColorLabels();
  queueSync();
}

function normalizeOriginSource(raw){
  const value = String(raw || "").trim().toLowerCase();
  if (value === "mobile") return "mobile";
  if (value === "browser") return "browser";
  return "unknown";
}

function normalizeProjectRef(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || row.projectId || "").trim();
  if (!id) return null;
  const name = String(row.name || row.projectName || id).trim() || id;
  return { id, name };
}

function normalizeCategoryAssignment(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const primaryCategoryId = String(row.primaryCategoryId || row.primary || "").trim();
  if (!primaryCategoryId) return null;
  const secondaryCategoryId = String(row.secondaryCategoryId || row.secondary || "").trim() || null;
  if (secondaryCategoryId && secondaryCategoryId === primaryCategoryId) return null;
  const sourceRaw = String(row.source || "").trim().toLowerCase();
  const source = sourceRaw === "user" || sourceRaw === "manual_override" ? "user" : (sourceRaw === "system" || sourceRaw === "auto" ? "system" : "");
  if (!source) return null;
  if (source === "user") {
    return {
      primaryCategoryId,
      secondaryCategoryId,
      source,
      algorithmVersion: null,
      classifiedAt: null,
      overriddenAt: String(row.overriddenAt || row.classifiedAt || "").trim() || null,
      confidence: null,
    };
  }
  const algorithmVersion = String(row.algorithmVersion || "").trim();
  const classifiedAt = String(row.classifiedAt || "").trim();
  if (!algorithmVersion || !classifiedAt) return null;
  return {
    primaryCategoryId,
    secondaryCategoryId,
    source,
    algorithmVersion,
    classifiedAt,
    overriddenAt: null,
    confidence: Number.isFinite(Number(row.confidence)) ? Math.max(0, Math.min(1, Number(row.confidence))) : null,
  };
}

function normalizeStringArray(raw){
  return uniqStrings(Array.isArray(raw) ? raw : []);
}

function normalizeLabelAssignments(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  return {
    workflowStatusLabelId: String(row.workflowStatusLabelId || "").trim(),
    priorityLabelId: String(row.priorityLabelId || "").trim(),
    actionLabelIds: normalizeStringArray(row.actionLabelIds),
    contextLabelIds: normalizeStringArray(row.contextLabelIds),
    customLabelIds: normalizeStringArray(row.customLabelIds),
  };
}

function normalizeLabelRecord(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || "").trim();
  if (!id) return null;
  const rawType = String(row.type || "").trim();
  const type = ["workflow_status", "priority", "action", "context", "custom"].includes(rawType) ? rawType : "custom";
  return {
    id,
    name: String(row.name || row.title || id).trim() || id,
    type,
    color: String(row.color || "").trim(),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.floor(Number(row.sortOrder)) : 0,
    createdAt: String(row.createdAt || "").trim(),
  };
}

function normalizeCategoryCatalogRecord(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || "").trim();
  if (!id) return null;
  const statusRaw = String(row.status || "").trim().toLowerCase();
  const status = ["active", "deprecated", "retired"].includes(statusRaw) ? statusRaw : "active";
  return {
    id,
    name: String(row.name || row.title || id).trim() || id,
    description: String(row.description || "").trim() || undefined,
    color: String(row.color || "").trim() || undefined,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.floor(Number(row.sortOrder)) : 0,
    createdAt: String(row.createdAt || "").trim(),
    updatedAt: String(row.updatedAt || "").trim() || undefined,
    status,
    replacementCategoryId: String(row.replacementCategoryId || "").trim() || null,
    aliases: normalizeStringArray(row.aliases),
  };
}

function normalizeCategoryCatalog(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src){
    const category = normalizeCategoryCatalogRecord(item);
    if (!category || seen.has(category.id)) continue;
    seen.add(category.id);
    out.push(category);
  }
  out.sort((a, b) => (
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.name || a.id).localeCompare(String(b.name || b.id))
    || String(a.id).localeCompare(String(b.id))
  ));
  return out;
}

function normalizeLabelCatalog(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src){
    const label = normalizeLabelRecord(item);
    if (!label || seen.has(label.id)) continue;
    seen.add(label.id);
    out.push(label);
  }
  out.sort((a, b) => (
    String(a.type || "").localeCompare(String(b.type || ""))
    || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.name || a.id).localeCompare(String(b.name || b.id))
    || String(a.id).localeCompare(String(b.id))
  ));
  return out;
}

function resolveLabelName(labelId){
  const id = String(labelId || "").trim();
  if (!id) return "";
  const found = (state.labelCatalog || []).find((row) => row.id === id);
  return String(found?.name || "").trim();
}

function labelSearchTokens(labels){
  const ids = [
    labels?.workflowStatusLabelId,
    labels?.priorityLabelId,
    ...(labels?.actionLabelIds || []),
    ...(labels?.contextLabelIds || []),
    ...(labels?.customLabelIds || []),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  const names = ids.map(resolveLabelName).filter(Boolean);
  return [...ids, ...names];
}

function normalizeKeywords(raw){
  return normalizeStringArray(raw);
}

function normalizeTags(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src){
    const tag = String(item || "").trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function normalizeFolderRecord(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || row.folderId || "").trim();
  const name = String(row.name || row.title || id).trim() || id;
  const createdAt = String(row.createdAt || "").trim();
  const updatedAt = String(row.updatedAt || "").trim();
  const kind = String(row.kind || "").trim().toLowerCase() === "project_backed" ? "project_backed" : "local";
  const projectRef = normalizeProjectRef(row.projectRef);
  return { id, name, createdAt, updatedAt, kind, projectRef };
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
  const pinned = !!(row.pinned ?? meta.pinned);
  const archived = !!(row.archived ?? meta.archived ?? (String(meta.state || "").trim().toLowerCase() === "archived"));
  const folderId = String(row.folderId || meta.folderId || meta.folder || "").trim();
  const folderName = String(row.folderName || meta.folderName || "").trim();
  const tags = normalizeTags(row.tags ?? meta.tags);
  const originSource = normalizeOriginSource(row.originSource ?? meta.originSource);
  const originProjectRef = normalizeProjectRef(row.originProjectRef ?? meta.originProjectRef);
  const category = normalizeCategoryAssignment(row.category ?? meta.category);
  const labels = normalizeLabelAssignments(row.labels ?? meta.labels);
  const keywords = normalizeKeywords(row.keywords ?? meta.keywords);

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
    originSource,
    originProjectRef,
    category,
    labels,
    keywords,
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
        archived: latest?.archived ?? latest?.meta?.archived ?? (String(latest?.meta?.state || "").trim().toLowerCase() === "archived"),
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
    const folder = normalizeFolderRecord(row);
    if (!folder.id || seen.has(folder.id)) continue;
    out.push(folder);
    seen.add(folder.id);
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
      updatedAt: "",
      kind: "local",
      projectRef: null,
    });
    seen.add(folderId);
  }
  derived.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  return derived;
}

function normalizeFolderBinding(raw){
  const src = raw && typeof raw === "object" ? raw : {};
  const binding = {
    folderId: String(src.folderId || src.id || "").trim(),
    folderName: String(src.folderName || src.name || src.title || "").trim(),
  };
  const source = String(src.folderBindingSource || "").trim().toLowerCase();
  if (source === "auto" || source === "user") binding.folderBindingSource = source;
  return binding;
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

async function fetchLabelCatalog(force = false){
  if (!force && Array.isArray(state.labelCatalog) && state.labelCatalog.length) return state.labelCatalog.slice();
  const attempt = await tryArchiveOps(LABEL_CATALOG_OPS, {});
  if (attempt.ok){
    state.labelCatalog = normalizeLabelCatalog(attempt.result);
  }
  return Array.isArray(state.labelCatalog) ? state.labelCatalog.slice() : [];
}

async function fetchCategoryCatalog(force = false){
  if (!force && Array.isArray(state.categoryCatalog) && state.categoryCatalog.length) return state.categoryCatalog.slice();
  const attempt = await tryArchiveOps(CATEGORY_CATALOG_OPS, {});
  if (attempt.ok){
    state.categoryCatalog = normalizeCategoryCatalog(attempt.result);
  }
  return Array.isArray(state.categoryCatalog) ? state.categoryCatalog.slice() : [];
}

function resolveCategoryRecord(categoryId){
  const id = String(categoryId || "").trim();
  if (!id) return null;
  return (state.categoryCatalog || []).find((row) => row.id === id) || null;
}

function resolveCategoryName(categoryId){
  const id = String(categoryId || "").trim();
  if (!id) return "Uncategorized";
  return String(resolveCategoryRecord(id)?.name || "Uncategorized");
}

function updateRowCategory(snapshotId, category){
  const sid = String(snapshotId || "").trim();
  if (!sid) return;
  const normalized = normalizeCategoryAssignment(category);
  if (Array.isArray(state.rowsCache)){
    state.rowsCache = state.rowsCache.map((row) => (
      row.snapshotId === sid ? { ...row, category: normalized } : row
    ));
  }
  if (state.currentReaderSnapshot?.snapshotId === sid) {
    const meta = state.currentReaderSnapshot.meta && typeof state.currentReaderSnapshot.meta === "object"
      ? state.currentReaderSnapshot.meta
      : {};
    state.currentReaderSnapshot.meta = {
      ...meta,
      category: normalized,
    };
  }
}

function applySnapshotCategoryUpdate(snap){
  if (!snap || typeof snap !== "object") return;
  const sid = String(snap.snapshotId || "").trim();
  if (!sid) return;
  const meta = snap.meta && typeof snap.meta === "object" ? snap.meta : {};
  updateRowCategory(sid, meta.category);
  if (state.currentReaderSnapshot?.snapshotId === sid) {
    state.currentReaderSnapshot = {
      ...state.currentReaderSnapshot,
      ...snap,
      meta: {
        ...(state.currentReaderSnapshot.meta && typeof state.currentReaderSnapshot.meta === "object" ? state.currentReaderSnapshot.meta : {}),
        ...meta,
      },
    };
  }
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

function filterRows(rows, view, query, folderId = "", tagFilter = ""){
  const q = normalizeText(query).toLowerCase();
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!matchesView(row, view)) return false;
    if (!matchesFolder(row, folderId)) return false;
    if (tagFilter && !(Array.isArray(row.tags) ? row.tags : []).includes(tagFilter)) return false;

    if (!q) return true;
    const labels = row?.labels || {};
    const haystack = [
      row.title,
      row.excerpt,
      row.chatId,
      row.folderId,
      row.folderName,
      row.originSource,
      row?.category?.primaryCategoryId,
      row?.category?.secondaryCategoryId,
      ...labelSearchTokens(labels),
      ...(row.tags || []),
      ...(row.keywords || []),
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

  setRouteMeta("Studio", folderId ? `${title} / ${folderLabel}` : title, subtitle);
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
      folderKind: folder.kind || "local",
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

  const projectItems = items.filter((item) => item.kind === "folder" && item.folderKind === "project_backed");
  const localItems = items.filter((item) => item.kind === "folder" && item.folderKind !== "project_backed");
  const utilityItems = items.filter((item) => item.kind !== "folder");
  const orderedItems = [...utilityItems.slice(0, 1), ...projectItems, ...localItems, ...utilityItems.slice(1)];

  orderedItems.forEach((item) => {
    if (projectItems.length && localItems.length && item === localItems[0]){
      const divider = document.createElement("hr");
      divider.className = "wbFolderDivider";
      host.appendChild(divider);
    }
    const link = document.createElement("a");
    link.className = "wbFolderItem";
    if (!item.count) link.classList.add("is-empty");
    if (item.folderKind === "project_backed") link.classList.add("is-project-backed");
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
  const rows = filterRows(state.rowsCache || [], view, query, folderId, state.lastTagFilter);
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
    openBtn.textContent = state.currentReaderSnapshot ? "Open tab" : "Open";
    openBtn.title = sid ? "Open this saved chat in a separate Studio tab" : "Select a saved chat first";
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

function renderRow(row, isSelected = false, activeView = "", activeFolderId = ""){
  const article = document.createElement("article");
  article.className = "wbHistoryRow";
  article.dataset.snapshotId = row.snapshotId;
  article.dataset.chatId = row.chatId;
  if (isSelected) article.classList.add("is-selected");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "wbRowMain";

  const suppressPin = (activeView === "pinned");
  const suppressArchive = (activeView === "archive");
  const suppressFolder = !!(activeFolderId && activeFolderId !== FOLDER_FILTER_NONE && row.folderId === activeFolderId);

  const sourceLabel = row.originSource === "mobile"
    ? "Mobile"
    : (row.originSource === "browser" ? "Browser" : "");
  const visibleTags = Array.isArray(row.tags) ? row.tags.slice(0, 2) : [];
  const hiddenTagCount = Math.max(0, (Array.isArray(row.tags) ? row.tags.length : 0) - visibleTags.length);
  const badgeHtml = [
    (row.pinned && !suppressPin) ? `<span class="wbBadge wbBadge--pin">Pinned</span>` : "",
    (row.archived && !suppressArchive) ? `<span class="wbBadge wbBadge--archive">Archived</span>` : "",
    sourceLabel ? `<span class="wbBadge wbBadge--source">${esc(sourceLabel)}</span>` : "",
    (!suppressFolder && row.folderId) ? `<span class="wbBadge wbBadge--folder">${esc(row.folderName || row.folderId)}</span>` : "",
    ...visibleTags.map((tag) => `<span class="wbBadge wbBadge--tag" data-tag="${esc(tag)}" role="button" tabindex="0" aria-label="Filter by tag: ${esc(tag)}">${esc(tag)}</span>`),
    hiddenTagCount > 0 ? `<span class="wbBadge wbBadge--tag-more">+${hiddenTagCount}</span>` : "",
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
  `;

  // Delete button — revealed on row hover, two-click confirm pattern
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "wbDeleteBtn";
  deleteBtn.setAttribute("aria-label", "Delete this chat from Studio");
  deleteBtn.setAttribute("title", "Delete from Studio");
  deleteBtn.innerHTML = DELETE_ICON_HTML;

  deleteBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (deleteConfirm.chatId === row.chatId){
      // Second click — execute
      executeDeleteChat(row.chatId, row.snapshotId, article).catch(console.warn);
    } else {
      // First click — arm confirm
      clearDeleteConfirm();
      armDeleteConfirm(row.chatId, row.snapshotId, article, deleteBtn);
    }
  });

  const actions = document.createElement("div");
  actions.className = "wbRowActions";
  actions.appendChild(deleteBtn);

  article.appendChild(button);
  if (badgeHtml){
    const badgesEl = document.createElement("div");
    badgesEl.className = "wbBadges";
    badgesEl.innerHTML = badgeHtml;
    article.appendChild(badgesEl);
  }
  article.appendChild(actions);
  article.addEventListener("pointerenter", () => selectRow(row, article));
  article.addEventListener("focusin", () => selectRow(row, article));
  article.addEventListener("pointerleave", () => {
    // Disarm confirm if mouse leaves the row without confirming
    if (deleteConfirm.chatId === row.chatId) clearDeleteConfirm();
  });
  button.addEventListener("click", () => {
    selectRow(row, article);
    location.hash = `#/read/${encodeURIComponent(row.snapshotId)}`;
  });

  return article;
}

function buildReaderDOM(snap){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const title = String(meta.title || snap?.chatId || "Saved chat");

  const root = document.createElement("div");
  root.className = "cgFrame";
  root.dataset.chatTitle = title;
  root.dataset.chatId = String(snap?.chatId || meta.chatId || "");
  root.dataset.projectId = String(meta.projectId || "");
  root.innerHTML = `
    <div class="cgBody">
      <div class="cgThread">
        <div class="cgScroll" data-testid="conversation-turns"></div>
      </div>
    </div>
  `;

  const sc = root.querySelector(".cgScroll");
  sc.classList.add("wbReaderScroll");
  const scrollRoot = sc;
  const richTurns = normalizeRichTurns(meta.richTurns);
  let assistantTurnEls = [];

  if (richTurns.length){
    sc.classList.add("wbRichRoot");
    sc.classList.add("is-rich");
    assistantTurnEls = mountRichTurns(sc, richTurns, snap.snapshotId, snap);
  }

  if (!assistantTurnEls.length){
    sc.classList.add("wbRichRoot"); // semantic markdown CSS applies to canonical renders too
    sc.classList.remove("is-rich"); // is-rich stays false — signals DOM-rich vs text-rich
    assistantTurnEls = buildCanonicalConversation(sc, snap);
  }

  try {
    if (typeof W.H2O?.studioHost?.mount === "function") {
      W.H2O.studioHost.mount({
        readerRoot: root,
        turnsEl: sc,
        scrollEl: scrollRoot,
        snapshot: snap,
        assistantTurnEls
      });
    }
  } catch {}

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
  setRouteMeta("Studio", title, "");
}

function renderCategoryInspector(snap = state.currentReaderSnapshot){
  const panel = $("#inspectorPanel");
  if (!panel) return;
  if (!snap) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const meta = snap.meta && typeof snap.meta === "object" ? snap.meta : {};
  const category = normalizeCategoryAssignment(meta.category);
  const catalog = (state.categoryCatalog || []).filter((row) => row.status === "active");
  const primaryId = String(category?.primaryCategoryId || "");
  const secondaryId = String(category?.secondaryCategoryId || "");
  const source = String(category?.source || "system");
  const primaryName = resolveCategoryName(primaryId);
  const secondaryName = secondaryId ? resolveCategoryName(secondaryId) : "";
  const confidence = Number(category?.confidence);
  const confidenceText = category?.source === "system" && Number.isFinite(confidence)
    ? `${Math.round(confidence * 100)}%`
    : "";

  const options = catalog.map((row) => (
    `<option value="${esc(row.id)}"${row.id === primaryId ? " selected" : ""}>${esc(row.name || row.id)}</option>`
  )).join("");

  panel.hidden = false;
  panel.innerHTML = `
    <section class="wbInspectorCard" aria-label="Category">
      <div class="wbInspectorHead">
        <div>
          <div class="wbInspectorLabel">Category</div>
          <div class="wbInspectorTitle">${esc(primaryName)}</div>
        </div>
        <span class="wbCategorySource">${source === "user" ? "Manual" : "System"}</span>
      </div>
      ${secondaryName ? `<div class="wbInspectorLine">Secondary: ${esc(secondaryName)}</div>` : ""}
      ${confidenceText ? `<div class="wbInspectorLine">Confidence: ${esc(confidenceText)}</div>` : ""}
      <label class="wbInspectorField">
        <span>Primary category</span>
        <select id="categoryAssignSelect" class="wbSelect wbInspectorSelect" aria-label="Primary category">
          ${options}
        </select>
      </label>
      <div class="wbInspectorActions">
        ${source === "user" ? `<button class="wbBtn" id="restoreCategoryBtn" type="button">Restore system</button>` : ""}
        <button class="wbBtn" id="reclassifyCategoryBtn" type="button">Reclassify</button>
      </div>
    </section>
  `;
}

async function renderList(view, folderId = "", opts = {}){
  const token = ++state.renderToken;
  const nextView = normalizeArchiveView(view);
  const selectedFolderId = normalizeFolderFilter(folderId);
  const query = $("#q")?.value || "";
  const listPanel = $("#viewListPanel");
  const listEl = $("#viewList");
  const readerEl = $("#viewReader");
  const inspectorEl = $("#inspectorPanel");

  state.currentReaderSnapshot = null;
  state.lastView = nextView;
  state.lastFolderId = selectedFolderId;
  applyUiState();
  setActiveNav(nextView);

  const listHash = buildListHash(nextView, selectedFolderId);
  studioHostUnmount("studio:list");
  if (location.hash !== listHash){
    try {
      history.replaceState(
        Object.assign({}, history.state || {}, { h2oStudioReader: false }),
        "",
        listHash
      );
    } catch {
      location.hash = listHash;
    }
  }
  if (readerEl) readerEl.hidden = true;
  if (inspectorEl) {
    inspectorEl.hidden = true;
    inspectorEl.innerHTML = "";
  }
  if (listPanel) listPanel.hidden = false;
  if (listEl) listEl.innerHTML = `<div class="wbState">Loading ${esc(viewCopy(nextView).toLowerCase())}…</div>`;
  setSidebarChatLoading(nextView, selectedFolderId);
  setRouteMeta("Studio", viewCopy(nextView), "Loading archive state");

  try {
    const fetched = await fetchWorkbenchRows(!!opts.force);
    if (token !== state.renderToken) return;
    const [allRows] = await Promise.all([
      enrichRowsWithFolderData(fetched, !!opts.force),
      fetchLabelCatalog(!!opts.force).catch(() => []),
      fetchCategoryCatalog(!!opts.force).catch(() => []),
    ]);
    if (token !== state.renderToken) return;

    renderFolderSidebar(allRows, nextView, selectedFolderId);
    const rows = filterRows(allRows, nextView, query, selectedFolderId, state.lastTagFilter);
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
      const el = renderRow(row, isSelected, nextView, selectedFolderId);
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
  setRouteMeta("Studio", "Saved chat", "Loading snapshot");

  try {
    const snap = await callArchive("loadSnapshot", { snapshotId: sid });
    if (token !== state.renderToken) return;
    if (!snap){
      if (readerEl) readerEl.innerHTML = `<div class="wbState">Snapshot not found.</div>`;
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      state.currentReaderSnapshot = null;
      renderCategoryInspector(null);
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

    await Promise.all([
      fetchFolderCatalog(false).catch(() => []),
      fetchLabelCatalog(false).catch(() => []),
      fetchCategoryCatalog(false).catch(() => []),
    ]);
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
    renderCategoryInspector(snap);
    setActiveSidebarChat(state.selectedSnapshotId);
    syncSelectionControls();
    applyUiState();
  } catch (error){
    if (token !== state.renderToken) return;
    if (readerEl) {
      readerEl.innerHTML = `<div class="wbState wbState--error">${esc(error?.message || "Failed to load snapshot.")}</div>`;
    }
    state.selectedSnapshotId = "";
    state.selectedChatId = "";
    state.currentReaderSnapshot = null;
    renderCategoryInspector(null);
    setActiveSidebarChat("");
    syncSelectionControls();
  }
}

function openStudioRouteInNewTab(route){
  const normalizedRoute = String(route || "/saved").startsWith("/")
    ? String(route || "/saved")
    : `/${String(route || "saved")}`;
  const chromeApi = typeof chrome !== "undefined" ? chrome : null;
  const url = chromeApi?.runtime?.getURL
    ? `${chromeApi.runtime.getURL("surfaces/studio/studio.html")}#${normalizedRoute}`
    : `${location.origin}${location.pathname}#${normalizedRoute}`;

  if (chromeApi?.tabs?.create){
    return new Promise((resolve, reject) => {
      try {
        chromeApi.tabs.create({ url }, (tab) => {
          const le = chromeApi.runtime?.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          resolve(tab);
        });
      } catch (error){
        reject(error);
      }
    });
  }

  const opened = window.open(url, "_blank", "noopener");
  if (!opened) throw new Error("Popup blocked while opening Studio tab.");
  return Promise.resolve(opened);
}

async function openSelectedReaderTab(){
  const sid = String($("#openReaderTabBtn")?.dataset?.snapshotId || "").trim();
  if (!sid) return;
  const route = `/read/${encodeURIComponent(sid)}`;
  try {
    await callArchive("openWorkbench", { route });
    return;
  } catch {}
  try {
    await openStudioRouteInNewTab(route);
  } catch (error){
    window.alert(String(error?.message || error || "Failed to open Studio tab."));
  }
}

function handleCloseTopbar(){
  const route = parseHash();
  if (route.name === "read"){
    location.hash = buildListHash(state.lastView || "saved", state.lastFolderId || "");
    return;
  }
  window.close();
}

async function handleFolderAssignChange(){
  const select = $("#folderAssignSelect");
  const chatId = String(state.selectedChatId || state.currentReaderSnapshot?.chatId || "").trim();
  if (!(select && chatId)) return;

  const nextFolderId = normalizeFolderFilter(select.value);
  select.disabled = true;
  try {
    const attempt = await tryArchiveOps(FOLDER_SET_OPS, { chatId, folderId: nextFolderId, folderBindingSource: "user" });
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

async function handleCategoryAssignChange(){
  const select = $("#categoryAssignSelect");
  const snapshotId = String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
  const primaryCategoryId = String(select?.value || "").trim();
  if (!(select && snapshotId && primaryCategoryId)) return;

  select.disabled = true;
  try {
    const attempt = await tryArchiveOps(CATEGORY_SET_OPS, { snapshotId, primaryCategoryId });
    if (!attempt.ok) throw attempt.error || new Error("Category update failed");
    applySnapshotCategoryUpdate(attempt.result);
    renderCategoryInspector();
    refreshSidebarChatList(state.lastView, state.lastFolderId);
  } catch (error){
    renderCategoryInspector();
    window.alert(String(error?.message || error || "Failed to update category."));
  } finally {
    if (select) select.disabled = false;
  }
}

async function handleCategoryReclassify(){
  const snapshotId = String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
  if (!snapshotId) return;
  const buttons = ["#restoreCategoryBtn", "#reclassifyCategoryBtn"].map((selector) => $(selector)).filter(Boolean);
  buttons.forEach((btn) => { btn.disabled = true; });
  try {
    const attempt = await tryArchiveOps(CATEGORY_RECLASSIFY_OPS, { snapshotId });
    if (!attempt.ok) throw attempt.error || new Error("Category reclassify failed");
    applySnapshotCategoryUpdate(attempt.result);
    renderCategoryInspector();
    refreshSidebarChatList(state.lastView, state.lastFolderId);
  } catch (error){
    renderCategoryInspector();
    window.alert(String(error?.message || error || "Failed to reclassify category."));
  }
}

function setSidebarExpanded(expanded){
  state.sidebarExpanded = !!expanded;
  writeUiPrefs();
  applyUiState();
}

function openSidebar(){
  setSidebarExpanded(true);
}

function closeSidebar(){
  setSidebarExpanded(false);
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

  $("#closeBtn")?.addEventListener("click", handleCloseTopbar);
  $("#openReaderTabBtn")?.addEventListener("click", openSelectedReaderTab);
  $("#sidebarCollapseBtn")?.addEventListener("click", closeSidebar);
  $("#railSidebarBtn")?.addEventListener("click", openSidebar);
  $("#folderAssignSelect")?.addEventListener("change", () => {
    handleFolderAssignChange().catch(console.error);
  });
  $("#inspectorPanel")?.addEventListener("change", (ev) => {
    if (ev.target?.id === "categoryAssignSelect") {
      handleCategoryAssignChange().catch(console.error);
    }
  });
  $("#inspectorPanel")?.addEventListener("click", (ev) => {
    const target = ev.target?.closest?.("#restoreCategoryBtn, #reclassifyCategoryBtn");
    if (!target) return;
    handleCategoryReclassify().catch(console.error);
  });

  $("#q")?.addEventListener("input", () => {
    const route = parseHash();
    if (route.name === "list") renderList(route.view, route.folderId).catch(console.error);
  });

  $("#viewList")?.addEventListener("click", (ev) => {
    const tagEl = ev.target.closest(".wbBadge--tag[data-tag]");
    if (!tagEl) return;
    ev.stopPropagation();
    const tag = String(tagEl.dataset.tag || "").trim();
    if (!tag) return;
    state.lastTagFilter = (state.lastTagFilter === tag) ? "" : tag;
    const route = parseHash();
    if (route.name === "list") renderList(route.view, route.folderId).catch(console.error);
  });

  window.addEventListener("hashchange", () => renderRoute().catch(console.error));

  const refreshFromForeground = () => {
    state.rowsCache = null;
    renderRoute({ force: true }).catch(console.error);
  };
  window.addEventListener("focus", refreshFromForeground);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshFromForeground();
  });

  if (!location.hash) location.hash = "#/saved";
  renderRoute().catch(console.error);
}

boot();
