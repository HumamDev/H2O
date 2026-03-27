#!/usr/bin/env node
import fs from "fs";
import path from "path";
import process from "process";

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

const SRC_DIR = process.env.H2O_SRC_DIR || process.cwd();
const DEPS_FILE =
  resolveArg("--deps") ||
  process.env.H2O_DEPS_FILE ||
  path.join(SRC_DIR, "config", "loader-deps.json");
const ORDER_FILE =
  resolveArg("--dev-order") ||
  process.env.H2O_ORDER_FILE ||
  path.join(SRC_DIR, "config", "dev-order.tsv");
const PROXY_PACK_FILE =
  resolveArg("--proxy-pack") ||
  process.env.H2O_PROXY_PACK_FILE ||
  path.join(SRC_DIR, "..", "h2o-dev-server", "dev_output", "proxy", "_paste-pack.ext.txt");
const STRICT_WARN = hasFlag("--strict-warn");

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
function uniq(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).map(normalizeAlias).filter(Boolean)));
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
    const alias = normalizeAlias(parts.slice(1).join("\t"));
    if (!alias) continue;

    enabled.set(alias, statusEmoji === "🟢");
    order.push(alias);
  }
  return { enabled, order };
}

function aliasIdFromRequireUrl(url) {
  const raw = String(url || "");
  const m = raw.match(/\/alias\/([^/?#]+\.user\.js)(?:[?#]|$)/i);
  return m ? m[1] : "";
}

function parseProxyPack(txt) {
  const order = [];
  if (!txt) return { order };

  const hdrRe = /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/g;
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

function checkCriticalGroupOrder(orderName, sequence, groups, manifestScripts, errors, warnings) {
  if (!Array.isArray(sequence) || !sequence.length) {
    warnings.push(`${orderName}: no data available to verify critical groups.`);
    return;
  }
  for (const [groupName, groupMeta] of Object.entries(groups || {})) {
    const members = uniq(groupMeta.members || []);
    if (!members.length) continue;
    const criticalMembers = members.filter((id) => !!manifestScripts[id]?.critical);
    const wanted = criticalMembers.length ? criticalMembers : members.filter((id) => !!manifestScripts[id]);
    if (wanted.length < 2) continue;
    const present = wanted.filter((id) => sequence.includes(id));
    if (present.length < 2) continue;
    const pos = subsequencePositions(sequence, present);
    if (!pos) {
      errors.push(`${orderName}: critical group ${groupName} missing expected members in order scan.`);
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
        `${orderName}: critical group ${groupName} order mismatch.\n` +
          `Expected subsequence:\n${formatList(present)}`
      );
    }
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
  for (const [id, raw] of Object.entries(manifestScriptsRaw)) {
    manifestScripts[id] = {
      phase: normalizePhase(raw.phase),
      dependsOn: uniq(raw.dependsOn),
      optionalDependsOn: uniq(raw.optionalDependsOn),
      after: uniq(raw.after),
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
    const members = uniq(meta.members || []);
    for (const id of members) {
      if (!ids.has(id)) warnings.push(`Group ${groupName} references unknown script: ${id}`);
    }
  }

  const devOrder = parseDevOrderTsv(readTextIfExists(ORDER_FILE));
  const proxyPack = parseProxyPack(readTextIfExists(PROXY_PACK_FILE));
  if (devOrder.order.length) {
    checkCriticalGroupOrder(`dev-order (${rel(ORDER_FILE)})`, devOrder.order, groups, manifestScripts, errors, warnings);
  } else {
    warnings.push(`No dev-order data found at ${rel(ORDER_FILE)}.`);
  }
  if (proxyPack.order.length) {
    checkCriticalGroupOrder(`proxy-pack (${rel(PROXY_PACK_FILE)})`, proxyPack.order, groups, manifestScripts, errors, warnings);
  } else {
    warnings.push(`No proxy-pack data found at ${rel(PROXY_PACK_FILE)}.`);
  }

  console.log([
    `[validate-loader-order] deps: ${rel(DEPS_FILE)}`,
    `[validate-loader-order] dev-order: ${rel(ORDER_FILE)} ${devOrder.order.length ? `(entries=${devOrder.order.length})` : "(missing/empty)"}`,
    `[validate-loader-order] proxy-pack: ${rel(PROXY_PACK_FILE)} ${proxyPack.order.length ? `(entries=${proxyPack.order.length})` : "(missing/empty)"}`,
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
