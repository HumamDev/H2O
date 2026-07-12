#!/usr/bin/env node
//
// tools/loader/validate-loader-order.mjs
//
// Phase 0D migration: path defaults sourced from tools/paths.mjs while
// preserving every input precedence rule the pre-Phase-0D version had:
//   CLI flag (--deps/--dev-order/--proxy-pack)  >  env var  >  paths.mjs default.
// H2O_PROXY_PACK_FILE is NOT modeled by paths.mjs, so it remains an explicit
// in-file env check to preserve byte-identical override semantics.
//
// LOCAL helpers (stripEmojiAndInvisibles, toAliasName, normalizeAliasId) are
// intentionally retained — they happen to produce identical output to
// tools/script-registry.mjs but keeping them local minimizes the diff and
// keeps Phase 0D scope strictly to path-constant migration. A later phase
// can consolidate the helpers.

import fs from "fs";
import path from "path";
import process from "process";
import vm from "node:vm";

import {
  REPO_ROOT,
  LOADER_DEPS_JSON,
  DEV_ORDER_TSV,
  PROXY_PACK_FILE as PROXY_PACK_FILE_DEFAULT,
  LOADER_TIERS_JSON,
} from "../paths.mjs";
import { createChromeLiveSourceSnapshots } from "../product/extensions/chatgpt/chrome/chrome-live-source-snapshots.mjs";
import { makeChromeLiveLoaderJs } from "../product/extensions/chatgpt/chrome/chrome-live-loader.mjs";

const PHASE_RANK = Object.freeze({
  "document-start": 0,
  "document-end": 1,
  "document-idle": 2,
});

function resolveArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

// Local aliases preserve pre-Phase-0D variable names. Precedence is identical
// to the original: CLI flag > env var (via paths.mjs for the modeled ones,
// or via in-file check for H2O_PROXY_PACK_FILE) > paths.mjs default.
//   SRC_DIR         === REPO_ROOT     (H2O_SRC_DIR honored by paths.mjs)
//   DEPS_FILE       === CLI > H2O_DEPS_FILE > REPO_ROOT/config/loader-deps.json
//   ORDER_FILE      === CLI > H2O_ORDER_FILE > REPO_ROOT/config/dev-order.tsv
//   PROXY_PACK_FILE === CLI > H2O_PROXY_PACK_FILE > SERVER_ROOT/dev_output/proxy/_paste-pack.ext.txt
const SRC_DIR = REPO_ROOT;
const DEPS_FILE = resolveArg("--deps") || LOADER_DEPS_JSON;
const ORDER_FILE = resolveArg("--dev-order") || DEV_ORDER_TSV;
const PROXY_PACK_FILE =
  resolveArg("--proxy-pack") ||
  process.env.H2O_PROXY_PACK_FILE ||
  PROXY_PACK_FILE_DEFAULT;
const STRICT_WARN = hasFlag("--strict-warn");
const REPORT_RUNTIME = hasFlag("--report-runtime");
const THEME_CORE_FILE = path.join(SRC_DIR, "src-runtime-base", "8A1a.🟪🎨 Theme Core 🎨.js");
const CHROME_LIVE_LOADER_FILE = path.join(
  SRC_DIR,
  "tools",
  "product",
  "extensions",
  "chatgpt",
  "chrome",
  "chrome-live-loader.mjs"
);

function readTextIfExists(fp) {
  try {
    if (!fp || !fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, "utf8");
  } catch {
    return null;
  }
}
function rel(fp) {
  try {
    return path.relative(SRC_DIR, fp) || fp;
  } catch {
    return fp;
  }
}
function normalizePhase(v) {
  const s = String(v || "document-idle").trim();
  return Object.prototype.hasOwnProperty.call(PHASE_RANK, s) ? s : "document-idle";
}
function normalizeAlias(v) {
  return String(v || "").trim();
}
function stripEmojiAndInvisibles(s) {
  return String(s || "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D\u200B-\u200F\uFEFF\u2060\u00AD]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
}
function toAliasName(filename) {
  const base = String(filename || "").replace(/(\.user)?\.js$/i, "");
  const firstDot = base.indexOf(".");
  if (firstDot <= 0) return "";
  const id = base.slice(0, firstDot).trim();
  let title = base.slice(firstDot + 1);
  title = stripEmojiAndInvisibles(title)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!id || !title) return "";
  return `${id}._${title}_.js`;
}
function normalizeAliasId(v) {
  const alias = toAliasName(v);
  if (alias) return alias;
  const raw = String(v || "").trim();
  return raw ? raw.replace(/\.user\.js$/i, ".js") : "";
}
function uniq(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).map(normalizeAlias).filter(Boolean)));
}
function uniqAliasIds(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).map(normalizeAliasId).filter(Boolean)));
}
function groupMemberOrder(groupMeta, mode = "display") {
  if (mode === "runtime") {
    return uniqAliasIds(groupMeta?.runtimeOrder || groupMeta?.members || []);
  }
  return uniqAliasIds(groupMeta?.members || []);
}
function formatList(items) {
  return items.map((x) => `  - ${x}`).join("\n");
}
function subsequencePositions(sequence, wanted) {
  const pos = [];
  let i = 0;
  for (const want of wanted) {
    while (i < sequence.length && sequence[i] !== want) i += 1;
    if (i >= sequence.length) return null;
    pos.push(i);
    i += 1;
  }
  return pos;
}

function parseDevOrderTsv(txt) {
  const enabled = new Map();
  const order = [];
  if (!txt) return { enabled, order };

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const noInline = line.replace(/\s+#.*$/, "").trim();
    if (!noInline) continue;
    const parts = noInline.split("\t");
    if (parts.length < 2) continue;

    const statusEmoji = String(parts[0] || "").trim();
    const alias = normalizeAlias(normalizeAliasId(parts.slice(1).join("\t")));
    if (!alias) continue;

    enabled.set(alias, statusEmoji === "🟢");
    order.push(alias);
  }
  return { enabled, order };
}

function aliasIdFromRequireUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "http://127.0.0.1:5500/");
    const parts = String(u.pathname || "").split("/").filter(Boolean);
    const idx = parts.lastIndexOf("alias");
    const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : (parts[parts.length - 1] || "");
    return normalizeAliasId(decodeURIComponent(tail || ""));
  } catch {}
  const m = raw.match(/\/alias\/([^?#]+)(?:[?#]|$)/i);
  if (m) {
    try { return normalizeAliasId(decodeURIComponent(m[1])); } catch { return normalizeAliasId(m[1]); }
  }
  return normalizeAliasId(raw);
}

function parseProxyPack(txt) {
  const order = [];
  if (!txt) return { order };

  const hdrRe = /\/\/ ==H2O Module==[\s\S]*?\/\/ ==\/H2O Module==/g;
  const requireRe = /^[ \t]*\/\/[ \t]*@require[ \t]+(.+)$/im;
  const blocks = String(txt).match(hdrRe) || [];
  for (const block of blocks) {
    const m = block.match(requireRe);
    if (!m) continue;
    const alias = aliasIdFromRequireUrl(m[1]);
    if (alias) order.push(alias);
  }
  return { order };
}

function topoSortHard(manifestScripts, nodes) {
  const indeg = new Map();
  const outs = new Map();
  for (const id of nodes) {
    indeg.set(id, 0);
    outs.set(id, []);
  }
  for (const id of nodes) {
    const meta = manifestScripts[id];
    for (const dep of meta.dependsOn) {
      if (!nodes.has(dep)) continue;
      outs.get(dep).push(id);
      indeg.set(id, (indeg.get(id) || 0) + 1);
    }
  }
  const q = Array.from(nodes).filter((id) => (indeg.get(id) || 0) === 0).sort();
  const out = [];
  while (q.length) {
    const cur = q.shift();
    out.push(cur);
    for (const nxt of outs.get(cur) || []) {
      indeg.set(nxt, (indeg.get(nxt) || 0) - 1);
      if ((indeg.get(nxt) || 0) === 0) {
        q.push(nxt);
        q.sort();
      }
    }
  }
  return out.length === nodes.size ? out : null;
}

function findHardCycle(manifestScripts, nodes) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function dfs(id) {
    visiting.add(id);
    stack.push(id);
    for (const dep of manifestScripts[id].dependsOn) {
      if (!nodes.has(dep)) continue;
      if (visiting.has(dep)) {
        const idx = stack.indexOf(dep);
        return stack.slice(idx).concat(dep);
      }
      if (!visited.has(dep)) {
        const cyc = dfs(dep);
        if (cyc) return cyc;
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }
  for (const id of nodes) {
    if (visited.has(id)) continue;
    const cyc = dfs(id);
    if (cyc) return cyc;
  }
  return null;
}

function checkCriticalGroupOrder(orderName, sequence, groups, manifestScripts, errors, warnings, mode = "display") {
  if (!Array.isArray(sequence) || !sequence.length) {
    warnings.push(`${orderName}: no data available to verify critical groups.`);
    return;
  }
  for (const [groupName, groupMeta] of Object.entries(groups || {})) {
    const members = groupMemberOrder(groupMeta, mode);
    if (!members.length) continue;
    const criticalMembers = members.filter((id) => !!manifestScripts[id]?.critical);
    const wanted = criticalMembers.length ? criticalMembers : members.filter((id) => !!manifestScripts[id]);
    if (wanted.length < 2) continue;
    const present = wanted.filter((id) => sequence.includes(id));
    if (present.length < 2) continue;
    const pos = subsequencePositions(sequence, present);
    if (!pos) {
      errors.push(`${orderName}: critical group ${groupName} missing expected ${mode} members in order scan.`);
      continue;
    }
    let ok = true;
    for (let i = 1; i < pos.length; i += 1) {
      if (pos[i] <= pos[i - 1]) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      errors.push(
        `${orderName}: critical group ${groupName} ${mode} order mismatch.\n` +
          `Expected ${mode} subsequence:\n${formatList(present)}`
      );
    }
  }
}

function checkGeneratedCatalogRuntimeOrder(groups, manifestScripts, errors) {
  let catalog = null;
  try {
    catalog = createChromeLiveSourceSnapshots({ srcRoot: SRC_DIR, orderFile: ORDER_FILE }).DEV_SCRIPT_CATALOG;
  } catch (err) {
    errors.push(`generated catalog snapshot failed: ${String((err && err.message) || err)}`);
    return;
  }

  for (const [groupName, groupMeta] of Object.entries(groups || {})) {
    if (!Array.isArray(groupMeta?.runtimeOrder) || !groupMeta.runtimeOrder.length) continue;
    const expected = groupMemberOrder(groupMeta, "runtime");
    if (!expected.length) continue;

    const actual = Object.entries(catalog || {})
      .filter(([, meta]) => String(meta?.runtimeGroup || "") === groupName)
      .sort((a, b) => Number(a[1]?.runtimeOrder) - Number(b[1]?.runtimeOrder))
      .map(([aliasId]) => aliasId);

    if (actual.length !== expected.length || actual.some((aliasId, idx) => aliasId !== expected[idx])) {
      errors.push(
        `generated catalog: runtime group ${groupName} order mismatch.\n` +
          `Expected:\n${formatList(expected)}\n` +
          `Actual:\n${formatList(actual)}`
      );
      continue;
    }

    const position = new Map(actual.map((aliasId, idx) => [aliasId, idx]));
    for (const aliasId of actual) {
      const meta = manifestScripts[aliasId];
      if (!meta) continue;
      for (const dep of meta.dependsOn) {
        if (position.has(dep) && position.get(dep) >= position.get(aliasId)) {
          errors.push(`generated catalog: ${aliasId} appears before hard dependency ${dep} in ${groupName}.`);
        }
      }
      for (const target of meta.after) {
        if (position.has(target) && position.get(target) >= position.get(aliasId)) {
          errors.push(`generated catalog: ${aliasId} violates declared after-order for ${target} in ${groupName}.`);
        }
      }
    }
  }
}

function readGeneratedRuntimeOrder(proxyPackText, errors) {
  let snapshots;
  try {
    snapshots = createChromeLiveSourceSnapshots({ srcRoot: SRC_DIR, orderFile: ORDER_FILE });
  } catch (err) {
    errors.push(`generated runtime snapshot failed: ${String((err && err.message) || err)}`);
    return null;
  }

  const loaderJs = makeChromeLiveLoaderJs({
    DEV_TAG: "[validate-loader-order]",
    DEV_TITLE: "Loader order validator",
    DEV_HAS_CONTROLS: false,
    PROXY_PACK_URL: "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt",
    ...snapshots,
    STORAGE_KEY: "h2oLoaderOrderValidator",
    STORAGE_ORDER_OVERRIDES_KEY: "h2oLoaderOrderValidatorOverrides",
    PAGE_FOLDER_BRIDGE_FILE: "",
    PAGE_PILOT_OBSERVER_FILE: "",
  });
  const bootNeedle = "  boot().catch((e) => {";
  const orderNeedle = "    return applyRuntimeOrderFix(out);";
  if (!loaderJs.includes(bootNeedle) || !loaderJs.includes(orderNeedle)) {
    errors.push("generated runtime probe failed: loader merge/order boundary not found.");
    return null;
  }

  const probeJs = loaderJs.replace(
    orderNeedle,
    `    globalThis.__H2O_VALIDATOR_PRE_ORDER__ = out.map((item) => String(item && item.aliasId || ""));
${orderNeedle}`
  ).replace(
    bootNeedle,
    `  const __validatorPack = parseProxyPack(globalThis.__H2O_VALIDATOR_PROXY_PACK__ || "");
  const __validatorMerged = mergeScriptsWithCatalog(__validatorPack, DEV_SCRIPT_CATALOG);
  globalThis.__H2O_VALIDATOR_RESULT__ = {
    raw: globalThis.__H2O_VALIDATOR_PRE_ORDER__ || [],
    merged: __validatorMerged.map((item) => ({
      aliasId: String(item && item.aliasId || ""),
      runtimeGroup: item && item.runtimeGroup,
      runtimeOrder: item && item.runtimeOrder,
    })),
  };
  return;
${bootNeedle}`
  );

  const noop = () => {};
  const context = {
    __H2O_VALIDATOR_PROXY_PACK__: String(proxyPackText || ""),
    location: { href: "https://chatgpt.com/" },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    performance: { now: () => 0, mark: noop, measure: noop },
    console: { debug: noop, info: noop, log: noop, warn: noop, error: noop },
    URL,
    decodeURIComponent,
    encodeURIComponent,
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    requestAnimationFrame: noop,
    cancelAnimationFrame: noop,
    addEventListener: noop,
    removeEventListener: noop,
    postMessage: noop,
    CustomEvent: class CustomEvent {},
    Event: class Event {},
    navigator: {},
    fetch: async () => ({ ok: false, text: async () => "" }),
  };
  context.window = context;
  context.self = context;
  context.document = {
    readyState: "complete",
    documentElement: { setAttribute: noop, appendChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute: noop, addEventListener: noop, remove: noop }),
  };
  context.chrome = {
    runtime: {
      getURL: (value) => value,
      onMessage: { addListener: noop },
      sendMessage: noop,
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: noop },
    },
  };

  try {
    vm.runInNewContext(probeJs, context, { timeout: 5000 });
    return JSON.parse(JSON.stringify(context.__H2O_VALIDATOR_RESULT__ || null));
  } catch (err) {
    errors.push(`generated runtime probe failed: ${String((err && err.message) || err)}`);
    return null;
  }
}

function checkGeneratedRuntimeOrderResult(sourceName, result, groups, manifestScripts, errors) {
  const raw = Array.isArray(result.raw) ? result.raw : [];
  const mergedEntries = Array.isArray(result.merged) ? result.merged : [];
  const merged = mergedEntries.map((entry) => normalizeAliasId(entry?.aliasId)).filter(Boolean);
  const declaredMembers = new Set();

  for (const [groupName, groupMeta] of Object.entries(groups || {})) {
    if (!Array.isArray(groupMeta?.runtimeOrder) || !groupMeta.runtimeOrder.length) continue;
    const declaredRaw = groupMeta.runtimeOrder.map(normalizeAliasId).filter(Boolean);
    const expected = uniqAliasIds(groupMeta.runtimeOrder);
    if (declaredRaw.length !== expected.length) {
      errors.push(`generated runtime: group ${groupName} contains duplicate runtimeOrder members.`);
    }
    for (const aliasId of expected) declaredMembers.add(aliasId);

    const entries = mergedEntries.filter((entry) => String(entry?.runtimeGroup || "") === groupName);
    const actual = entries.map((entry) => normalizeAliasId(entry?.aliasId)).filter(Boolean);
    const positions = entries.map((entry) => Number(entry?.runtimeOrder));
    if (positions.some((value) => !Number.isFinite(value)) || new Set(positions).size !== positions.length) {
      errors.push(`generated runtime: group ${groupName} has missing or duplicate runtime positions.`);
    }
    if (actual.length !== expected.length || actual.some((aliasId, idx) => aliasId !== expected[idx])) {
      errors.push(
        `generated runtime: group ${groupName} final order mismatch.\n` +
          `Expected:\n${formatList(expected)}\n` +
          `Actual:\n${formatList(actual)}`
      );
    }
    if (REPORT_RUNTIME) {
      const memberSet = new Set(expected);
      const before = raw.map(normalizeAliasId).filter((aliasId) => memberSet.has(aliasId));
      console.log(`[validate-loader-order] runtime ${sourceName} ${groupName} before: ${before.join(" -> ")}`);
      console.log(`[validate-loader-order] runtime ${sourceName} ${groupName} final:  ${actual.join(" -> ")}`);
    }
  }

  if (merged.length !== new Set(merged).size) {
    errors.push("generated runtime: final merged script order contains duplicate aliases.");
  }

  const rawPosition = new Map(raw.map((aliasId, idx) => [normalizeAliasId(aliasId), idx]));
  const finalPosition = new Map(merged.map((aliasId, idx) => [aliasId, idx]));
  const priorViolations = new Set();
  const finalViolations = new Set();
  for (const [aliasId, meta] of Object.entries(manifestScripts)) {
    if (!finalPosition.has(aliasId)) continue;
    for (const dep of meta.dependsOn) {
      const key = `${aliasId}|hard|${dep}`;
      if (rawPosition.has(dep) && rawPosition.get(dep) >= rawPosition.get(aliasId)) priorViolations.add(key);
      if (finalPosition.has(dep) && finalPosition.get(dep) >= finalPosition.get(aliasId)) {
        finalViolations.add(key);
      }
    }
    for (const target of meta.after) {
      const key = `${aliasId}|after|${target}`;
      if (rawPosition.has(target) && rawPosition.get(target) >= rawPosition.get(aliasId)) priorViolations.add(key);
      if (finalPosition.has(target) && finalPosition.get(target) >= finalPosition.get(aliasId)) {
        finalViolations.add(key);
      }
    }
  }
  for (const violation of finalViolations) {
    if (!priorViolations.has(violation)) {
      const [aliasId, kind, target] = violation.split("|");
      errors.push(
        kind === "hard"
          ? `generated runtime: runtime ordering moved ${aliasId} before hard dependency ${target}.`
          : `generated runtime: runtime ordering made ${aliasId} violate declared after-order for ${target}.`
      );
    }
  }

  const rawUnrelated = raw.map(normalizeAliasId).filter((aliasId) => aliasId && !declaredMembers.has(aliasId));
  const mergedUnrelated = merged.filter((aliasId) => !declaredMembers.has(aliasId));
  if (
    rawUnrelated.length !== mergedUnrelated.length ||
    rawUnrelated.some((aliasId, idx) => aliasId !== mergedUnrelated[idx])
  ) {
    errors.push("generated runtime: explicit runtime ordering changed unrelated script relative order.");
  }
}

function checkGeneratedRuntimeOrder(groups, manifestScripts, errors) {
  const cases = [
    ["proxy-pack", readTextIfExists(PROXY_PACK_FILE) || ""],
    ["catalog-fallback", ""],
  ];
  for (const [sourceName, proxyPackText] of cases) {
    const result = readGeneratedRuntimeOrder(proxyPackText, errors);
    if (!result) continue;
    checkGeneratedRuntimeOrderResult(sourceName, result, groups, manifestScripts, errors);
  }
}

function createThemeFixtureDom({ withHead = true } = {}) {
  const nodes = [];
  const attributes = new Map();

  function removeNode(node) {
    const idx = nodes.indexOf(node);
    if (idx >= 0) nodes.splice(idx, 1);
    node.isConnected = false;
  }
  function createElement(tagName) {
    const node = {
      tagName: String(tagName || "").toUpperCase(),
      id: "",
      textContent: "",
      style: {},
      isConnected: false,
      setAttribute(name, value) { this[String(name)] = String(value); },
      getAttribute(name) { return this[String(name)] ?? null; },
      addEventListener() {},
      removeEventListener() {},
      remove() { removeNode(this); },
    };
    return node;
  }
  function appendChild(node) {
    if (!nodes.includes(node)) nodes.push(node);
    node.isConnected = true;
    return node;
  }

  const html = {
    appendChild,
    setAttribute(name, value) { attributes.set(String(name), String(value)); },
    getAttribute(name) { return attributes.has(String(name)) ? attributes.get(String(name)) : null; },
  };
  const head = withHead ? { appendChild } : null;
  const document = {
    readyState: "loading",
    documentElement: html,
    head,
    body: {},
    createElement,
    getElementById(id) { return nodes.find((node) => node.id === String(id) && node.isConnected) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
  return {
    document,
    html,
    nodes,
    appendStyle(id, textContent = "") {
      const style = createElement("style");
      style.id = id;
      style.textContent = textContent;
      appendChild(style);
      return style;
    },
    countId(id) { return nodes.filter((node) => node.id === id && node.isConnected).length; },
  };
}

function makeThemePrepaintFixtureLoader(errors) {
  let snapshots;
  try {
    snapshots = createChromeLiveSourceSnapshots({ srcRoot: SRC_DIR, orderFile: ORDER_FILE });
  } catch (err) {
    errors.push(`theme prepaint fixture snapshot failed: ${String((err && err.message) || err)}`);
    return null;
  }
  const loaderJs = makeChromeLiveLoaderJs({
    DEV_TAG: "[validate-theme-prepaint]",
    DEV_TITLE: "Theme prepaint validator",
    DEV_HAS_CONTROLS: false,
    PROXY_PACK_URL: "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt",
    ...snapshots,
    STORAGE_KEY: "h2oThemePrepaintValidator",
    STORAGE_ORDER_OVERRIDES_KEY: "h2oThemePrepaintValidatorOverrides",
    PAGE_FOLDER_BRIDGE_FILE: "",
    PAGE_PILOT_OBSERVER_FILE: "",
  });
  const bootNeedle = "  boot().catch((e) => {";
  if (!loaderJs.includes(bootNeedle)) {
    errors.push("theme prepaint fixture failed: loader boot boundary not found.");
    return null;
  }
  return loaderJs.replace(bootNeedle, `  return;\n${bootNeedle}`);
}

function runThemePrepaintLoaderFixture(loaderJs, { rawState, systemLight = false, evaluations = 1 } = {}) {
  const dom = createThemeFixtureDom();
  const marks = [];
  const listeners = new Map();
  const noop = () => {};
  const addEventListener = (type, fn) => {
    if (typeof fn !== "function") return;
    const key = String(type || "");
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(fn);
  };
  class FixtureEvent {
    constructor(type, init = {}) {
      this.type = String(type || "");
      this.detail = init.detail;
      this.data = init.data;
    }
  }
  const context = {
    location: { href: "https://chatgpt.com/" },
    localStorage: {
      getItem(key) {
        return key === "h2o:prm:cgx:theme:state:v1" ? (rawState ?? null) : null;
      },
      setItem: noop,
      removeItem: noop,
    },
    matchMedia: () => ({ matches: !!systemLight }),
    performance: { now: () => 0, mark: (name) => marks.push(String(name)), measure: noop },
    console: { debug: noop, info: noop, log: noop, warn: noop, error: noop },
    URL,
    decodeURIComponent,
    encodeURIComponent,
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    requestAnimationFrame: noop,
    cancelAnimationFrame: noop,
    addEventListener,
    removeEventListener: noop,
    postMessage: noop,
    dispatchEvent(event) {
      for (const fn of listeners.get(String(event?.type || "")) || []) fn.call(context, event);
      return true;
    },
    CustomEvent: FixtureEvent,
    Event: FixtureEvent,
    navigator: {},
    fetch: async () => ({ ok: false, text: async () => "" }),
    document: dom.document,
  };
  context.window = context;
  context.self = context;
  context.chrome = {
    runtime: { getURL: (value) => value, onMessage: { addListener: noop }, sendMessage: noop },
    storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener: noop } },
  };

  const vmContext = vm.createContext(context);
  for (let i = 0; i < evaluations; i += 1) vm.runInContext(loaderJs, vmContext, { timeout: 5000 });
  return { context, dom, marks, listeners };
}

function runThemeCoreReconciliationFixture(themeCoreSource, { withHead = true } = {}) {
  const dom = createThemeFixtureDom({ withHead });
  dom.appendStyle("h2o-theme-prepaint", "temporary");
  const requestedKeys = [];
  const noop = () => {};
  class FixtureEvent {
    constructor(type, init = {}) { this.type = String(type || ""); this.detail = init.detail; }
  }
  const context = {
    document: dom.document,
    localStorage: {
      getItem(key) {
        requestedKeys.push(String(key));
        return key === "h2o:prm:cgx:theme:state:v1"
          ? JSON.stringify({ mode: "dark", palette: "soft-charcoal", accent: "gold" })
          : null;
      },
      setItem: noop,
    },
    matchMedia: () => ({ matches: false }),
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
    CustomEvent: FixtureEvent,
    console: { debug: noop, info: noop, log: noop, warn: noop, error: noop },
    setTimeout: noop,
    clearTimeout: noop,
  };
  context.window = context;
  context.self = context;
  vm.runInNewContext(themeCoreSource, context, { timeout: 5000 });
  return { context, dom, requestedKeys };
}

function checkThemePrepaintContract(errors) {
  const initialErrorCount = errors.length;
  const loaderSource = readTextIfExists(CHROME_LIVE_LOADER_FILE);
  const themeCoreSource = readTextIfExists(THEME_CORE_FILE);
  if (!loaderSource || !themeCoreSource) {
    errors.push("theme prepaint contract: loader or Theme Core source is missing.");
    return;
  }

  const sharedLiterals = [
    "data-h2o-mode",
    "data-h2o-effective-mode",
    "h2o-theme-prepaint",
    "#fbf7ee",
    "#3a3429",
    "#1a1a1c",
    "rgba(231, 226, 217, 0.92)",
    "#000000",
    "rgba(231, 226, 217, 0.84)",
  ];
  for (const literal of sharedLiterals) {
    if (!loaderSource.includes(literal)) errors.push(`theme prepaint loader missing canonical literal: ${literal}`);
    if (!themeCoreSource.includes(literal)) errors.push(`Theme Core missing canonical prepaint literal: ${literal}`);
  }
  for (const mode of ["system", "light", "dark", "oled"]) {
    if (!loaderSource.includes(`"${mode}"`)) errors.push(`theme prepaint loader missing supported mode: ${mode}`);
    if (!themeCoreSource.includes(`'${mode}'`)) errors.push(`Theme Core missing supported mode: ${mode}`);
  }
  if (!loaderSource.includes('"h2o:prm:cgx:theme:state:v1"')) {
    errors.push("theme prepaint loader missing canonical storage key.");
  }
  if (!themeCoreSource.includes("const STYLE_SURFACE_ID = 'h2o-theme-surface';")) {
    errors.push("Theme Core missing canonical full surface style ID.");
  }
  if (!themeCoreSource.includes("D.getElementById(STYLE_PREPAINT_ID)?.remove?.();")) {
    errors.push("Theme Core missing loader prepaint removal contract.");
  }
  const prepaintCall = loaderSource.indexOf("try { applyThemePrepaint(); } catch {}");
  const pageStart = loaderSource.indexOf("const PAGE_STARTED_AT = Date.now();");
  const bootStart = loaderSource.indexOf("async function boot()");
  if (prepaintCall < 0 || pageStart < 0 || bootStart < 0 || prepaintCall > pageStart || prepaintCall > bootStart) {
    errors.push("theme prepaint loader invocation is not before loader boot setup.");
  }
  if ((loaderSource.match(/applyThemePrepaint\(\);/g) || []).length !== 1) {
    errors.push("theme prepaint loader must invoke the bootstrap exactly once per loader evaluation.");
  }

  const fixtureLoader = makeThemePrepaintFixtureLoader(errors);
  if (!fixtureLoader) return;
  const appliedCases = [
    ["stored light", { mode: "light" }, false, "light", "light"],
    ["stored dark", { mode: "dark" }, false, "dark", "dark"],
    ["stored OLED", { mode: "oled" }, false, "oled", "dark"],
    ["stored system with light OS", { mode: "system" }, true, "system", "light"],
    ["stored system with dark OS", { mode: "system" }, false, "system", "dark"],
  ];
  for (const [name, state, systemLight, expectedMode, expectedEffective] of appliedCases) {
    try {
      const result = runThemePrepaintLoaderFixture(fixtureLoader, {
        rawState: JSON.stringify(state),
        systemLight,
      });
      if (result.dom.html.getAttribute("data-h2o-mode") !== expectedMode) {
        errors.push(`theme prepaint fixture ${name}: canonical mode mismatch.`);
      }
      if (result.dom.html.getAttribute("data-h2o-effective-mode") !== expectedEffective) {
        errors.push(`theme prepaint fixture ${name}: effective mode mismatch.`);
      }
      if (result.dom.countId("h2o-theme-prepaint") !== 1) {
        errors.push(`theme prepaint fixture ${name}: expected exactly one prepaint style.`);
      }
      if (result.marks.filter((mark) => mark === "h2o:theme:prepaint:applied").length !== 1) {
        errors.push(`theme prepaint fixture ${name}: successful application mark mismatch.`);
      }
    } catch (err) {
      errors.push(`theme prepaint fixture ${name} threw: ${String((err && err.message) || err)}`);
    }
  }

  const rejectedCases = [
    ["missing state", null],
    ["corrupt JSON", "{"],
    ["unsupported mode", JSON.stringify({ mode: "sepia" })],
  ];
  for (const [name, rawState] of rejectedCases) {
    try {
      const result = runThemePrepaintLoaderFixture(fixtureLoader, { rawState });
      if (
        result.dom.countId("h2o-theme-prepaint") !== 0 ||
        result.dom.html.getAttribute("data-h2o-mode") !== null ||
        result.marks.includes("h2o:theme:prepaint:applied")
      ) {
        errors.push(`theme prepaint fixture ${name}: invalid state was not ignored.`);
      }
    } catch (err) {
      errors.push(`theme prepaint fixture ${name} threw: ${String((err && err.message) || err)}`);
    }
  }

  try {
    const duplicate = runThemePrepaintLoaderFixture(fixtureLoader, {
      rawState: JSON.stringify({ mode: "dark" }),
      evaluations: 2,
    });
    if (
      duplicate.dom.countId("h2o-theme-prepaint") !== 1 ||
      duplicate.marks.filter((mark) => mark === "h2o:theme:prepaint:applied").length !== 1
    ) {
      errors.push("theme prepaint fixture duplicate bootstrap evaluation was not idempotent.");
    }
  } catch (err) {
    errors.push(`theme prepaint fixture duplicate evaluation threw: ${String((err && err.message) || err)}`);
  }

  try {
    const spa = runThemePrepaintLoaderFixture(fixtureLoader, { rawState: JSON.stringify({ mode: "dark" }) });
    spa.dom.document.getElementById("h2o-theme-prepaint")?.remove?.();
    const markCount = spa.marks.length;
    spa.context.dispatchEvent(new spa.context.Event("popstate"));
    if (spa.dom.countId("h2o-theme-prepaint") !== 0 || spa.marks.length !== markCount) {
      errors.push("theme prepaint fixture SPA navigation recreated the bootstrap.");
    }
  } catch (err) {
    errors.push(`theme prepaint fixture SPA navigation threw: ${String((err && err.message) || err)}`);
  }

  try {
    const reconciled = runThemeCoreReconciliationFixture(themeCoreSource);
    if (!reconciled.requestedKeys.includes("h2o:prm:cgx:theme:state:v1")) {
      errors.push("Theme Core reconciliation did not read the canonical storage key.");
    }
    if (
      reconciled.dom.countId("h2o-theme-surface") !== 1 ||
      reconciled.dom.countId("h2o-theme-prepaint") !== 0
    ) {
      errors.push("Theme Core successful reconciliation did not replace the prepaint style.");
    }
  } catch (err) {
    errors.push(`Theme Core successful reconciliation fixture threw: ${String((err && err.message) || err)}`);
  }

  try {
    const blocked = runThemeCoreReconciliationFixture(themeCoreSource, { withHead: false });
    if (blocked.dom.countId("h2o-theme-prepaint") !== 1 || blocked.dom.countId("h2o-theme-surface") !== 0) {
      errors.push("Theme Core removed prepaint before full style installation succeeded.");
    }
  } catch (err) {
    errors.push(`Theme Core failed-install reconciliation fixture threw: ${String((err && err.message) || err)}`);
  }
  if (errors.length === initialErrorCount) {
    console.log("[validate-loader-order] theme prepaint: parity + 12 fixtures OK");
  }
}

function main() {
  const depsText = readTextIfExists(DEPS_FILE);
  if (!depsText) {
    console.error(`[validate-loader-order] Missing dependency manifest: ${DEPS_FILE}`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(depsText);
  } catch (err) {
    console.error(`[validate-loader-order] Failed to parse JSON: ${DEPS_FILE}`);
    console.error(String((err && err.message) || err));
    process.exit(1);
  }

  const manifestScriptsRaw = manifest.scripts || {};
  const groups = manifest.groups || {};
  const manifestScripts = {};
  for (const [idRaw, raw] of Object.entries(manifestScriptsRaw)) {
    const id = normalizeAliasId(idRaw);
    if (!id) continue;
    manifestScripts[id] = {
      phase: normalizePhase(raw.phase),
      dependsOn: uniqAliasIds(raw.dependsOn),
      optionalDependsOn: uniqAliasIds(raw.optionalDependsOn),
      after: uniqAliasIds(raw.after),
      group: String(raw.group || "").trim(),
      provides: uniq(raw.provides),
      critical: !!raw.critical,
    };
  }

  const errors = [];
  const warnings = [];
  const ids = new Set(Object.keys(manifestScripts));

  for (const [id, meta] of Object.entries(manifestScripts)) {
    if (meta.dependsOn.includes(id)) errors.push(`Hard self-dependency: ${id}`);
    if (meta.optionalDependsOn.includes(id)) warnings.push(`Optional self-dependency: ${id}`);
    if (meta.after.includes(id)) warnings.push(`Soft self-ordering: ${id}`);

    for (const dep of meta.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Missing hard dependency: ${id} -> ${dep}`);
        continue;
      }
      const depPhase = manifestScripts[dep].phase;
      if (PHASE_RANK[depPhase] > PHASE_RANK[meta.phase]) {
        errors.push(`Phase violation: ${id} (${meta.phase}) depends on later-phase ${dep} (${depPhase})`);
      }
    }
    for (const dep of meta.optionalDependsOn) {
      if (!ids.has(dep)) {
        warnings.push(`Missing optional dependency: ${id} -> ${dep}`);
        continue;
      }
      const depPhase = manifestScripts[dep].phase;
      if (PHASE_RANK[depPhase] > PHASE_RANK[meta.phase]) {
        warnings.push(`Optional dependency phase drift: ${id} (${meta.phase}) -> ${dep} (${depPhase})`);
      }
    }
    for (const dep of meta.after) {
      if (!ids.has(dep)) {
        warnings.push(`Missing soft order target: ${id} after ${dep}`);
        continue;
      }
      const depPhase = manifestScripts[dep].phase;
      if (PHASE_RANK[depPhase] > PHASE_RANK[meta.phase]) {
        warnings.push(`Soft ordering phase drift: ${id} (${meta.phase}) after ${dep} (${depPhase})`);
      }
    }
  }

  for (const phase of ["document-start", "document-end", "document-idle"]) {
    const nodes = new Set(Object.keys(manifestScripts).filter((id) => manifestScripts[id].phase === phase));
    const cyc = findHardCycle(manifestScripts, nodes);
    if (cyc) errors.push(`Hard dependency cycle in ${phase}: ${cyc.join(" -> ")}`);
    const sorted = topoSortHard(manifestScripts, nodes);
    if (!sorted && !cyc) errors.push(`Unable to topologically sort hard dependencies in ${phase}.`);
  }

  for (const [groupName, meta] of Object.entries(groups)) {
    const members = uniqAliasIds([...(meta.members || []), ...(meta.runtimeOrder || [])]);
    for (const id of members) {
      if (!ids.has(id)) warnings.push(`Group ${groupName} references unknown script: ${id}`);
    }
  }

  const devOrder = parseDevOrderTsv(readTextIfExists(ORDER_FILE));
  const proxyPack = parseProxyPack(readTextIfExists(PROXY_PACK_FILE));
  if (devOrder.order.length) {
    checkCriticalGroupOrder(`dev-order (${rel(ORDER_FILE)})`, devOrder.order, groups, manifestScripts, errors, warnings, "display");
  } else {
    warnings.push(`No dev-order data found at ${rel(ORDER_FILE)}.`);
  }
  if (proxyPack.order.length) {
    checkCriticalGroupOrder(`proxy-pack (${rel(PROXY_PACK_FILE)})`, proxyPack.order, groups, manifestScripts, errors, warnings, "runtime");
  } else {
    warnings.push(`No proxy-pack data found at ${rel(PROXY_PACK_FILE)}.`);
  }
  checkGeneratedCatalogRuntimeOrder(groups, manifestScripts, errors);
  checkGeneratedRuntimeOrder(groups, manifestScripts, errors);
  checkThemePrepaintContract(errors);

  // Phase 4 Step 5a: tier-coverage report. Info + warnings only — never errors.
  // Reads config/loader-tiers.json if present; otherwise prints a soft note.
  // Cross-checks kernel allowlist (L0/L1) and flags drift between tiers.json
  // and dev-order.tsv. Does NOT introduce a new failure path.
  // Phase 0D: imported from paths.mjs. paths.mjs's LOADER_TIERS_JSON honors
  // H2O_TIERS_FILE (additive — the pre-Phase-0D version had no env override
  // for this constant). Under the default invocation (no H2O_TIERS_FILE set),
  // this resolves to <REPO_ROOT>/config/loader-tiers.json, byte-identical to
  // the previous hardcoded path.
  const TIERS_FILE = LOADER_TIERS_JSON;
  const tiersText = readTextIfExists(TIERS_FILE);
  let tierLine = `[validate-loader-order] tiers: ${rel(TIERS_FILE)} (missing — using defaults)`;
  if (tiersText) {
    let tiersJson = null;
    try { tiersJson = JSON.parse(tiersText); } catch (e) {
      warnings.push(`Failed to parse ${rel(TIERS_FILE)}: ${e && e.message ? e.message : String(e)}`);
    }
    const scriptsMap = tiersJson && typeof tiersJson === "object" ? tiersJson.scripts : null;
    if (scriptsMap && typeof scriptsMap === "object") {
      const tierCounts = {};
      const explicit = new Set();
      for (const [aliasRaw, entry] of Object.entries(scriptsMap)) {
        const alias = String(aliasRaw || "").trim();
        if (!alias) continue;
        const tier = String((entry && entry.tier) || "").trim() || "L4";
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;
        explicit.add(alias);
      }
      // Kernel allowlist check (warning only)
      const kernel = (tiersJson && tiersJson.meta && tiersJson.meta.kernelAllowlist) || {};
      for (const tierName of ["L0", "L1"]) {
        const allow = new Set((Array.isArray(kernel[tierName]) ? kernel[tierName] : []).map(String));
        for (const [aliasRaw, entry] of Object.entries(scriptsMap)) {
          const alias = String(aliasRaw || "").trim();
          const t = String((entry && entry.tier) || "").trim();
          if (t === tierName && allow.size && !allow.has(alias)) {
            warnings.push(`Alias '${alias}' classified as ${tierName} but not in kernelAllowlist[${tierName}].`);
          }
        }
      }
      // Drift check: alias present in tiers but unknown to dev-order (warning only)
      const devOrderSet = new Set(devOrder.order.map((alias) => String(alias || "").trim()).filter(Boolean));
      if (devOrderSet.size) {
        for (const alias of explicit) {
          if (!devOrderSet.has(alias)) {
            warnings.push(`Alias '${alias}' listed in ${rel(TIERS_FILE)} but not present in ${rel(ORDER_FILE)}.`);
          }
        }
      }
      // L4-default count = total dev-order entries minus explicit
      const totalAliases = devOrderSet.size || explicit.size;
      const defaultedToL4 = Math.max(0, totalAliases - explicit.size);
      const summary = Object.keys(tierCounts).sort().map(k => `${k}=${tierCounts[k]}`).join(", ");
      tierLine = `[validate-loader-order] tiers: ${rel(TIERS_FILE)} (explicit ${explicit.size}: ${summary || "none"}; default-L4 ${defaultedToL4})`;
    }
  }

  console.log([
    `[validate-loader-order] deps: ${rel(DEPS_FILE)}`,
    `[validate-loader-order] dev-order: ${rel(ORDER_FILE)} ${devOrder.order.length ? `(entries=${devOrder.order.length})` : "(missing/empty)"}`,
    `[validate-loader-order] proxy-pack: ${rel(PROXY_PACK_FILE)} ${proxyPack.order.length ? `(entries=${proxyPack.order.length})` : "(missing/empty)"}`,
    tierLine,
  ].join("\n"));

  if (warnings.length) {
    console.warn(`\n[validate-loader-order] Warnings (${warnings.length})`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  if (errors.length) {
    console.error(`\n[validate-loader-order] Errors (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (STRICT_WARN && warnings.length) {
    console.error(`\n[validate-loader-order] Strict-warn enabled; failing due to warnings.`);
    process.exit(1);
  }

  console.log(`\n[validate-loader-order] OK`);
}

main();
