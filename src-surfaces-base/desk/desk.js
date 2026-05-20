// @version 1.0.0
const DESK_STORAGE_KEY = "deskPhase3State";
const OUTPUT_PLACEHOLDER = "Output will appear here.";
const SUMMARY_NOT_LIVE_MESSAGE =
  "Summary Chat is configured, but live helper execution is not wired in Phase 3 yet.";
const CLEANUP_WRAPPER_RE =
  /^(?:[#>*-]\s*)*\**(?:corrected text|corrected|grammar corrected|revised text|summary|summary result)\**:?\s*$/i;

const ROLE_CONFIG = {
  grammar: {
    label: "Grammar Chat",
    prompt:
      "Correct grammar only. Keep meaning, tone, structure, and formatting. Do not add explanations. Return only the corrected text.",
    outputMode: "clean",
    runner: "grammar"
  },
  summary: {
    label: "Summary Chat",
    prompt:
      "Summarize the text clearly and concisely. Preserve key meaning. Return only the summary.",
    outputMode: "clean",
    runner: "none"
  }
};

const elements = {
  notice: document.getElementById("deskNotice"),
  input: document.getElementById("deskInput"),
  roleSelect: document.getElementById("deskRoleSelect"),
  sendBtn: document.getElementById("deskSendBtn"),
  readSelectionBtn: document.getElementById("deskReadSelectionBtn"),
  readPageBtn: document.getElementById("deskReadPageBtn"),
  clearBtn: document.getElementById("deskClearBtn"),
  output: document.getElementById("deskOutput"),
  outputMeta: document.getElementById("deskOutputMeta"),
  cleanViewBtn: document.getElementById("deskCleanViewBtn"),
  rawViewBtn: document.getElementById("deskRawViewBtn"),
  copyBtn: document.getElementById("deskCopyBtn"),
  insertBtn: document.getElementById("deskInsertBtn"),
  currentRole: document.getElementById("deskCurrentRole"),
  roleCapabilityBadge: document.getElementById("deskRoleCapabilityBadge"),
  grammarHelperNote: document.getElementById("deskGrammarHelperNote"),
  grammarStatus: document.getElementById("deskGrammarStatus"),
  grammarTabId: document.getElementById("deskGrammarTabId"),
  openGrammarBtn: document.getElementById("deskOpenGrammarBtn"),
  focusGrammarBtn: document.getElementById("deskFocusGrammarBtn"),
  refreshGrammarBtn: document.getElementById("deskRefreshGrammarBtn"),
  togglePromptEditorBtn: document.getElementById("deskTogglePromptEditorBtn"),
  promptSection: document.getElementById("deskPromptSection"),
  promptPanelBody: document.getElementById("deskPromptPanelBody"),
  promptMeta: document.getElementById("deskPromptMeta"),
  promptScopeLabel: document.getElementById("deskPromptScopeLabel"),
  promptEditor: document.getElementById("deskPromptEditor"),
  resetPromptBtn: document.getElementById("deskResetPromptBtn")
};

const state = {
  currentRole: "grammar",
  promptOverrideByRole: {},
  outputViewMode: ROLE_CONFIG.grammar.outputMode,
  lastRawOutput: "",
  lastCleanOutput: "",
  lastOutputRole: null,
  showPromptEditor: false,
  grammarStatus: {
    status: "Unknown",
    tabId: null
  }
};

function isKnownRole(roleId) {
  return Object.prototype.hasOwnProperty.call(ROLE_CONFIG, roleId);
}

function getRoleConfig(roleId = state.currentRole) {
  return ROLE_CONFIG[isKnownRole(roleId) ? roleId : "grammar"];
}

function hasPromptOverride(roleId = state.currentRole) {
  return Object.prototype.hasOwnProperty.call(state.promptOverrideByRole, roleId);
}

function getEffectivePrompt(roleId = state.currentRole) {
  if (hasPromptOverride(roleId)) {
    return state.promptOverrideByRole[roleId];
  }

  return getRoleConfig(roleId).prompt;
}

function setPromptOverride(roleId, value) {
  if (value === getRoleConfig(roleId).prompt) {
    delete state.promptOverrideByRole[roleId];
    return;
  }

  state.promptOverrideByRole[roleId] = value;
}

function setNotice(text, tone = "info") {
  elements.notice.textContent = text;
  elements.notice.dataset.tone = tone;
}

function setCompactText(element, text, title = "") {
  element.textContent = text;

  if (title) {
    element.title = title;
  } else {
    element.removeAttribute("title");
  }
}

function unwrapSingleFence(text) {
  const match = String(text || "").match(/^```(?:[^\n]*)\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : String(text || "");
}

function cleanupOutput(rawText) {
  let cleaned = unwrapSingleFence(String(rawText || "").trim());
  if (!cleaned) return "";

  const lines = cleaned.split(/\r?\n/);
  if (lines.length > 1) {
    const firstLine = lines[0].trim();
    const remaining = lines.slice(1).join("\n").trim();

    if (remaining && CLEANUP_WRAPPER_RE.test(firstLine)) {
      cleaned = remaining;
    }
  }

  return unwrapSingleFence(cleaned).trim();
}

function getDisplayedOutputText() {
  if (state.outputViewMode === "raw") {
    return state.lastRawOutput;
  }

  return state.lastCleanOutput || state.lastRawOutput;
}

function setOutputBuffers(rawText, roleId) {
  const nextRaw = String(rawText || "").trim();
  state.lastRawOutput = nextRaw;
  state.lastCleanOutput = cleanupOutput(nextRaw);
  state.lastOutputRole = nextRaw ? roleId : null;
}

function clearOutputBuffers() {
  state.lastRawOutput = "";
  state.lastCleanOutput = "";
  state.lastOutputRole = null;
}

function renderOutput() {
  const displayedText = getDisplayedOutputText();
  const hasDisplayedOutput = Boolean(displayedText);

  elements.output.textContent = displayedText || OUTPUT_PLACEHOLDER;
  elements.output.dataset.empty = hasDisplayedOutput ? "false" : "true";

  const isClean = state.outputViewMode === "clean";
  elements.cleanViewBtn.classList.toggle("is-active", isClean);
  elements.cleanViewBtn.setAttribute("aria-pressed", String(isClean));
  elements.rawViewBtn.classList.toggle("is-active", !isClean);
  elements.rawViewBtn.setAttribute("aria-pressed", String(!isClean));

  elements.copyBtn.disabled = !hasDisplayedOutput;
  elements.insertBtn.disabled = !hasDisplayedOutput;

  if (!state.lastRawOutput) {
    setCompactText(elements.outputMeta, "No result", "No result yet.");
    elements.outputMeta.hidden = false;
    return;
  }

  elements.outputMeta.hidden = true;
}

function renderGrammarStatus() {
  elements.grammarStatus.textContent = state.grammarStatus.status || "Unknown";
  elements.grammarTabId.textContent =
    state.grammarStatus.tabId != null ? String(state.grammarStatus.tabId) : "—";
}

function renderPromptEditor(syncValue = true) {
  const role = getRoleConfig();
  const overrideActive = hasPromptOverride(state.currentRole);

  elements.promptSection.dataset.expanded = state.showPromptEditor ? "true" : "false";
  elements.promptPanelBody.hidden = !state.showPromptEditor;
  elements.togglePromptEditorBtn.textContent = state.showPromptEditor
    ? "Hide Prompt"
    : "Prompt Editor";
  elements.togglePromptEditorBtn.setAttribute("aria-expanded", String(state.showPromptEditor));

  elements.promptScopeLabel.textContent = `Hidden Prompt — ${role.label}`;
  setCompactText(
    elements.promptMeta,
    overrideActive ? "Override active" : "Default prompt",
    overrideActive
      ? `Custom hidden prompt for ${role.label}. It will be prepended before send.`
      : `Using default hidden prompt for ${role.label}. This text stays out of the visible input.`
  );
  elements.resetPromptBtn.disabled = !overrideActive;

  if (syncValue) {
    elements.promptEditor.value = getEffectivePrompt(state.currentRole);
  }
}

function renderRoleState() {
  const role = getRoleConfig();
  const isLive = role.runner === "grammar";

  elements.roleSelect.value = state.currentRole;
  elements.currentRole.textContent = role.label;
  elements.roleCapabilityBadge.textContent = isLive ? "Grammar live" : "Summary scaffold";
  elements.roleCapabilityBadge.dataset.state = isLive ? "live" : "pending";
  elements.roleCapabilityBadge.title = isLive
    ? "Live runner: Grammar helper tab."
    : SUMMARY_NOT_LIVE_MESSAGE;
  setCompactText(
    elements.grammarHelperNote,
    "Grammar only",
    isLive
      ? "These controls power the live Grammar workflow in Phase 3."
      : "These controls stay available for Grammar only in Phase 3. Summary has no live helper tab yet."
  );

  elements.sendBtn.textContent = isLive ? "Send to Grammar" : "Summary Not Live";
  elements.sendBtn.disabled = !isLive;
  elements.input.placeholder = isLive
    ? "Type or paste text for Grammar Chat..."
    : "Type or paste text for Summary Chat...";

  renderPromptEditor(true);
}

function buildStoredDeskState() {
  return {
    currentRole: state.currentRole,
    promptOverrideByRole: state.promptOverrideByRole,
    outputViewMode: state.outputViewMode
  };
}

async function persistDeskState() {
  try {
    await chrome.storage.local.set({ [DESK_STORAGE_KEY]: buildStoredDeskState() });
  } catch (error) {
    console.error("Desk state save failed:", error);
  }
}

async function restoreDeskState() {
  try {
    const data = await chrome.storage.local.get(DESK_STORAGE_KEY);
    const saved = data?.[DESK_STORAGE_KEY];

    if (!saved || typeof saved !== "object") {
      return;
    }

    if (isKnownRole(saved.currentRole)) {
      state.currentRole = saved.currentRole;
    }

    if (saved.outputViewMode === "clean" || saved.outputViewMode === "raw") {
      state.outputViewMode = saved.outputViewMode;
    }

    if (saved.promptOverrideByRole && typeof saved.promptOverrideByRole === "object") {
      state.promptOverrideByRole = Object.fromEntries(
        Object.entries(saved.promptOverrideByRole).filter(
          ([roleId, value]) => isKnownRole(roleId) && typeof value === "string"
        )
      );
    }
  } catch (error) {
    console.error("Desk state restore failed:", error);
  }
}

async function askRuntime(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function buildOutboundText(hiddenPrompt, visibleText) {
  const promptText = String(hiddenPrompt || "").trim();
  const userText = String(visibleText || "").trim();

  if (!promptText) return userText;
  return `${promptText}\n\n${userText}`;
}

function applyGrammarState(grammar) {
  state.grammarStatus = {
    status: grammar?.status || "Unknown",
    tabId: grammar?.tabId ?? null
  };
  renderGrammarStatus();
}

async function askActiveTab(type) {
  try {
    const response = await askRuntime(type);
    if (!response?.ok) {
      setNotice(response?.error || "Request failed.", "error");
      return;
    }

    const text = String(response.text || "").trim();
    if (!text) {
      setNotice("No text found on the active page.", "warning");
      return;
    }

    elements.input.value = text;
    elements.input.focus();
    setNotice("Loaded text into Desk input.", "success");
  } catch (error) {
    setNotice(`Bridge error: ${error?.message || String(error)}`, "error");
  }
}

async function refreshGrammarStatus(options = {}) {
  const { quiet = false } = options;

  try {
    const response = await askRuntime("DESK_GET_GRAMMAR_STATUS");
    if (!response?.ok) {
      applyGrammarState({ status: "Error", tabId: null });
      if (!quiet) {
        setNotice(response?.error || "Failed to get Grammar status.", "error");
      }
      return;
    }

    applyGrammarState(response.grammar || {});
    if (!quiet) {
      setNotice("Grammar helper status refreshed.", "info");
    }
  } catch (error) {
    applyGrammarState({ status: "Error", tabId: null });
    if (!quiet) {
      setNotice(`Status error: ${error?.message || String(error)}`, "error");
    }
  }
}

async function openGrammarTab() {
  try {
    const response = await askRuntime("DESK_OPEN_GRAMMAR_TAB");
    if (!response?.ok) {
      setNotice(response?.error || "Failed to open Grammar tab.", "error");
      return;
    }

    applyGrammarState(response.grammar || {});
    setNotice(
      response.grammar?.created
        ? `Grammar tab opened on tab ${response.grammar?.tabId}.`
        : `Grammar tab reused on tab ${response.grammar?.tabId}.`,
      "success"
    );
  } catch (error) {
    setNotice(`Open Grammar error: ${error?.message || String(error)}`, "error");
  }
}

async function focusGrammarTab() {
  try {
    const response = await askRuntime("DESK_FOCUS_GRAMMAR_TAB");
    if (!response?.ok) {
      setNotice(response?.error || "Failed to focus Grammar tab.", "error");
      return;
    }

    applyGrammarState(response.grammar || {});
    setNotice(`Focused Grammar tab ${response.grammar?.tabId}.`, "success");
  } catch (error) {
    setNotice(`Focus Grammar error: ${error?.message || String(error)}`, "error");
  }
}

async function sendCurrentRole() {
  const role = getRoleConfig();
  if (role.runner !== "grammar") {
    setNotice(SUMMARY_NOT_LIVE_MESSAGE, "warning");
    return;
  }

  const visibleText = elements.input.value.trim();
  if (!visibleText) {
    setNotice("Nothing to send. Paste or read some text first.", "warning");
    return;
  }

  try {
    setNotice("Sending to Grammar helper tab...", "info");
    const response = await askRuntime("DESK_RUN_GRAMMAR", {
      text: buildOutboundText(getEffectivePrompt(state.currentRole), visibleText)
    });

    if (response?.grammar) {
      applyGrammarState(response.grammar);
    }

    if (!response?.ok) {
      setNotice(response?.error || "Grammar run failed.", "error");
      return;
    }

    state.outputViewMode = role.outputMode || "clean";
    setOutputBuffers(response.text || "", state.currentRole);
    renderOutput();
    await persistDeskState();

    if (!state.lastRawOutput) {
      setNotice("Grammar returned no text.", "warning");
      return;
    }

    setNotice("Grammar response received.", "success");
  } catch (error) {
    setNotice(`Send Grammar error: ${error?.message || String(error)}`, "error");
  }
}

function clearAll() {
  elements.input.value = "";
  clearOutputBuffers();
  renderOutput();
  elements.input.focus();
  setNotice("Cleared input and output.", "info");
}

async function copyDisplayedOutput() {
  const text = getDisplayedOutputText();
  if (!text) {
    setNotice("No output available to copy.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setNotice("Copied displayed output.", "success");
  } catch (error) {
    setNotice(`Copy failed: ${error?.message || String(error)}`, "error");
  }
}

async function insertDisplayedOutput() {
  const text = getDisplayedOutputText();
  if (!text) {
    setNotice("No output available to insert.", "warning");
    return;
  }

  try {
    setNotice("Inserting output into the main input...", "info");
    const response = await askRuntime("DESK_INSERT_OUTPUT_INTO_MAIN_INPUT", { text });
    if (!response?.ok) {
      setNotice(response?.error || "Insert failed.", "error");
      return;
    }

    const tabId = response.mainTab?.id ?? response.mainTab?.tabId;
    setNotice(
      tabId != null
        ? `Inserted output into the main input on tab ${tabId}.`
        : "Inserted output into the main input.",
      "success"
    );
  } catch (error) {
    setNotice(`Insert error: ${error?.message || String(error)}`, "error");
  }
}

async function setOutputViewMode(mode) {
  if (mode !== "clean" && mode !== "raw") {
    return;
  }

  state.outputViewMode = mode;
  renderOutput();
  await persistDeskState();
}

async function handleRoleChange() {
  const nextRole = elements.roleSelect.value;
  if (!isKnownRole(nextRole)) {
    elements.roleSelect.value = state.currentRole;
    return;
  }

  state.currentRole = nextRole;
  state.outputViewMode = getRoleConfig(nextRole).outputMode || "clean";
  renderRoleState();
  renderOutput();
  await persistDeskState();

  if (getRoleConfig(nextRole).runner === "grammar") {
    setNotice("Grammar Chat selected. Hidden prompt updated.", "info");
    return;
  }

  setNotice(SUMMARY_NOT_LIVE_MESSAGE, "warning");
}

async function handlePromptInput() {
  setPromptOverride(state.currentRole, elements.promptEditor.value);
  renderPromptEditor(false);
  await persistDeskState();
}

async function resetPromptOverride() {
  delete state.promptOverrideByRole[state.currentRole];
  renderPromptEditor(true);
  await persistDeskState();
  setNotice(`Reset hidden prompt for ${getRoleConfig().label}.`, "success");
}

function togglePromptEditor() {
  state.showPromptEditor = !state.showPromptEditor;
  renderPromptEditor(true);
}

function bindEvents() {
  elements.roleSelect?.addEventListener("change", handleRoleChange);
  elements.sendBtn?.addEventListener("click", sendCurrentRole);
  elements.readSelectionBtn?.addEventListener("click", () =>
    askActiveTab("DESK_REQUEST_ACTIVE_SELECTION")
  );
  elements.readPageBtn?.addEventListener("click", () =>
    askActiveTab("DESK_REQUEST_ACTIVE_PAGE_TEXT")
  );
  elements.clearBtn?.addEventListener("click", clearAll);
  elements.cleanViewBtn?.addEventListener("click", () => setOutputViewMode("clean"));
  elements.rawViewBtn?.addEventListener("click", () => setOutputViewMode("raw"));
  elements.copyBtn?.addEventListener("click", copyDisplayedOutput);
  elements.insertBtn?.addEventListener("click", insertDisplayedOutput);
  elements.openGrammarBtn?.addEventListener("click", openGrammarTab);
  elements.focusGrammarBtn?.addEventListener("click", focusGrammarTab);
  elements.refreshGrammarBtn?.addEventListener("click", () => refreshGrammarStatus());
  elements.togglePromptEditorBtn?.addEventListener("click", togglePromptEditor);
  elements.promptEditor?.addEventListener("input", handlePromptInput);
  elements.resetPromptBtn?.addEventListener("click", resetPromptOverride);

  elements.input?.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !elements.sendBtn.disabled) {
      event.preventDefault();
      void sendCurrentRole();
    }
  });
}

async function init() {
  await restoreDeskState();
  renderRoleState();
  renderGrammarStatus();
  renderOutput();
  bindEvents();
  await refreshGrammarStatus({ quiet: true });

  if (getRoleConfig().runner === "grammar") {
    setNotice("Desk loaded successfully.", "info");
  } else {
    setNotice(SUMMARY_NOT_LIVE_MESSAGE, "warning");
  }
}

void init();
