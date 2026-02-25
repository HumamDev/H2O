(() => {
  "use strict";

  const PROXY_PACK_URL = "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt";
  const STORAGE_KEY = "h2oExtDevToggleMapV1";
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
  const HDR_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/g;

  const elList = document.getElementById("list");
  const elCounts = document.getElementById("counts");
  const elPackUrl = document.getElementById("pack-url");
  const elHint = document.getElementById("hint");
  const elDot = document.getElementById("dot");

  let scripts = [];
  let toggleMap = {};

  elPackUrl.textContent = PROXY_PACK_URL;

  function setDot(mode) {
    elDot.classList.remove("ok", "err");
    if (mode === "ok") elDot.classList.add("ok");
    if (mode === "err") elDot.classList.add("err");
  }

  function readTag(metaText, tag) {
    const rx = new RegExp("^\\s*//\\s*@" + tag + "\\s+(.+?)\\s*$", "mi");
    const m = String(metaText || "").match(rx);
    return m ? String(m[1]).trim() : "";
  }

  function normalizeRunAt(runAtRaw) {
    const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
    if (v === "document-start") return "document-start";
    if (v === "document-end") return "document-end";
    return "document-idle";
  }

  function aliasIdFromRequireUrl(urlStr) {
    const raw = String(urlStr || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const idx = parts.lastIndexOf("alias");
      const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : (parts[parts.length - 1] || "");
      return decodeURIComponent(tail || "");
    } catch {}
    const m = raw.match(new RegExp("/alias/([^?#]+)", "i"));
    if (m) {
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    return raw;
  }

  function parseProxyPack(packText) {
    const headers = String(packText || "").match(HDR_RE) || [];
    const out = [];
    for (const h of headers) {
      const name = readTag(h, "name") || "(unnamed)";
      const runAt = normalizeRunAt(readTag(h, "run-at") || "document-idle");
      const requireUrl = readTag(h, "require");
      if (!requireUrl) continue;
      const aliasId = aliasIdFromRequireUrl(requireUrl) || name;
      out.push({ name, runAt, requireUrl, aliasId });
    }
    return out;
  }

  function sendFetchText(url) {
    return new Promise((resolve, reject) => {
      const reqUrl = url + (url.includes("?") ? "&" : "?") + "popupcb=" + encodeURIComponent(Date.now());
      chrome.runtime.sendMessage({ type: MSG_FETCH_TEXT, url: reqUrl }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        if (!resp || !resp.ok) return reject(new Error(resp?.error || ("HTTP " + Number(resp?.status || 0))));
        resolve(String(resp.text || ""));
      });
    });
  }

  function storageGetMap() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const le = chrome.runtime.lastError;
        if (le) return resolve({});
        const map = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY] ? res[STORAGE_KEY] : {};
        resolve(map);
      });
    });
  }

  function storageSetMap(nextMap) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: nextMap }, () => resolve());
    });
  }

  function storageReset() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([STORAGE_KEY], () => resolve());
    });
  }

  function isEnabled(item) {
    return toggleMap[item.aliasId] !== false;
  }

  function countsText() {
    const total = scripts.length;
    const enabled = scripts.filter(isEnabled).length;
    const disabled = total - enabled;
    return enabled + "/" + total + " enabled · " + disabled + " disabled";
  }

  function render() {
    elCounts.textContent = countsText();
    elList.innerHTML = "";

    if (!scripts.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No scripts found in proxy pack.";
      elList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of scripts) {
      const row = document.createElement("label");
      row.className = "row" + (isEnabled(item) ? "" : " off");
      row.title = item.requireUrl;

      const sw = document.createElement("span");
      sw.className = "switch";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isEnabled(item);
      cb.dataset.aliasId = item.aliasId;
      const slider = document.createElement("span");
      slider.className = "slider";
      sw.appendChild(cb);
      sw.appendChild(slider);

      const text = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = item.name;
      const alias = document.createElement("div");
      alias.className = "alias";
      alias.textContent = item.aliasId;
      text.appendChild(name);
      text.appendChild(alias);

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = item.runAt;

      row.appendChild(sw);
      row.appendChild(text);
      row.appendChild(badge);
      frag.appendChild(row);
    }
    elList.appendChild(frag);
  }

  async function setAliasEnabled(aliasId, enabled) {
    const key = String(aliasId || "");
    if (!key) return;
    if (enabled) delete toggleMap[key];
    else toggleMap[key] = false;
    await storageSetMap(toggleMap);
    render();
    elHint.textContent = "Changes saved. Reload the page to apply.";
  }

  async function setAll(enabled) {
    if (!scripts.length) return;
    const next = { ...toggleMap };
    for (const it of scripts) {
      if (enabled) delete next[it.aliasId];
      else next[it.aliasId] = false;
    }
    toggleMap = next;
    await storageSetMap(toggleMap);
    render();
    elHint.textContent = enabled ? "All scripts enabled. Reload the page to apply." : "All scripts disabled. Reload the page to apply.";
  }

  async function resetToggles() {
    await storageReset();
    toggleMap = {};
    render();
    elHint.textContent = "Toggles reset to default (all on). Reload the page to apply.";
  }

  async function reloadActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== "number") {
        elHint.textContent = "No active tab found.";
        return;
      }
      await chrome.tabs.reload(tab.id);
      elHint.textContent = "Active tab reloaded.";
    } catch (e) {
      elHint.textContent = "Reload failed: " + String(e && (e.message || e));
    }
  }

  async function loadAndRender() {
    setDot();
    elCounts.textContent = "Loading proxy pack...";
    try {
      const [packText, stored] = await Promise.all([
        sendFetchText(PROXY_PACK_URL),
        storageGetMap(),
      ]);
      scripts = parseProxyPack(packText);
      toggleMap = stored || {};
      setDot("ok");
      elHint.textContent = "Changes apply on page reload.";
      render();
    } catch (e) {
      setDot("err");
      elCounts.textContent = "Failed to load proxy pack";
      elList.innerHTML = "";
      const errBox = document.createElement("div");
      errBox.className = "error";
      errBox.textContent = String(e && (e.message || e));
      elList.appendChild(errBox);
      elHint.textContent = "Check local server and run Common build first.";
    }
  }

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.type !== "checkbox") return;
    const aliasId = String(t.dataset.aliasId || "");
    setAliasEnabled(aliasId, !!t.checked);
  });

  document.getElementById("all-on").addEventListener("click", () => setAll(true));
  document.getElementById("all-off").addEventListener("click", () => setAll(false));
  document.getElementById("reset").addEventListener("click", () => resetToggles());
  document.getElementById("reload").addEventListener("click", () => reloadActiveTab());

  loadAndRender();
})();
