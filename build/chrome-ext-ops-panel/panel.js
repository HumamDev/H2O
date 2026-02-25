(() => {
  "use strict";

  const STORAGE_KEY = "h2oPanelPreviewStateV1";
  const DEFAULT_STATE = {
    shell: true,
    diagnostics: false,
    compact: false,
    markers: true,
    milestone_nav: false,
    milestone_notes: false,
    milestone_bookmarks: false,
    milestone_release: false,
    notes: "",
  };

  const statusEl = document.getElementById("status");
  const refs = {
    shell: document.getElementById("toggle-shell"),
    diagnostics: document.getElementById("toggle-diagnostics"),
    compact: document.getElementById("toggle-compact"),
    markers: document.getElementById("toggle-markers"),
    notes: document.getElementById("notes"),
  };

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = String(msg || "");
  }

  function getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const le = chrome.runtime.lastError;
        if (le) {
          setStatus("Storage read error");
          return resolve({ ...DEFAULT_STATE });
        }
        const saved = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY] ? res[STORAGE_KEY] : {};
        resolve({ ...DEFAULT_STATE, ...saved });
      });
    });
  }

  function saveState(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
        setStatus("Saved locally in chrome.storage");
        resolve();
      });
    });
  }

  async function applyState(state) {
    refs.shell.checked = !!state.shell;
    refs.diagnostics.checked = !!state.diagnostics;
    refs.compact.checked = !!state.compact;
    refs.markers.checked = !!state.markers;
    refs.notes.value = String(state.notes || "");
    for (const el of document.querySelectorAll('.checklist input[type="checkbox"][data-key]')) {
      const key = String(el.dataset.key || "");
      el.checked = !!state[key];
    }
  }

  function collectState() {
    const out = {
      shell: !!refs.shell.checked,
      diagnostics: !!refs.diagnostics.checked,
      compact: !!refs.compact.checked,
      markers: !!refs.markers.checked,
      notes: String(refs.notes.value || ""),
    };
    for (const el of document.querySelectorAll('.checklist input[type="checkbox"][data-key]')) {
      out[String(el.dataset.key || "")] = !!el.checked;
    }
    return out;
  }

  async function init() {
    const state = await getState();
    await applyState(state);
    setStatus("Saved locally in chrome.storage");
  }

  let saveTimer = 0;
  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer);
    setStatus("Saving...");
    saveTimer = setTimeout(() => {
      saveState(collectState());
    }, 120);
  }

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches('input[type="checkbox"]')) queueSave();
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === "notes") queueSave();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await chrome.storage.local.remove([STORAGE_KEY]);
    await applyState({ ...DEFAULT_STATE });
    setStatus("Reset to defaults");
  });

  init();
})();
