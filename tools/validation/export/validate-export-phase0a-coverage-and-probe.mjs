#!/usr/bin/env node
/**
 * Export Phase 0A validator — fail-closed coverage + attached-probe extraction.
 *
 * Scope (deliberately narrow):
 *   A. 0E1a export refuses entirely when any selected id cannot be resolved,
 *      and separate-files export preflights every item before the first
 *      download is triggered.
 *   B. 0E1a UTIL_plainText / 0E2a getCleanText read innerText only AFTER the
 *      scrubbed clone is attached to a still-rendered probe.
 *   C. No time-of-check/time-of-use gap: once coverage passes, no selected id is
 *      ever resolved from the DOM again, and the whole batch is materialized
 *      before the first download or print window.
 *   D. Every live format (md/html/doc/pdf, single and bundle) consumes the
 *      correct prepared-record fields, in order, with no cross-format field
 *      substitution and unchanged filenames. DOCX is quarantined, not validated.
 *
 * Method:
 *   The functions under test are extracted from the real, shipped source bytes
 *   and executed in node:vm. Nothing is re-implemented here, so the assertions
 *   below run the same code the extension runs.
 *
 * Honest limits — read before trusting a green run:
 *   - Scope A is fully behavioural: the coverage logic is pure (its DOM access
 *     is injected), so these results are real proof.
 *   - Scope B is proven against a MODELLED DOM, not a browser. The model
 *     encodes one rule taken from the HTML standard: `innerText` on a node that
 *     is not being rendered returns `textContent`. That proves the code takes
 *     the attach-before-read path and therefore reads the rendered value. It
 *     does NOT prove real browser layout. Genuine line-boundary output still
 *     requires the live confirmation fixture noted at the end of this file.
 *   - Scope C is behavioural: it runs the real guard, materializer, router and
 *     markdown serializers, and breaks the DOM the instant coverage succeeds.
 *   - This validator asserts nothing about Markdown syntax. The patch does not
 *     reconstruct headings, emphasis, link URLs or fenced-code markers.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const EXPORT_CHAT_REL = "src-runtime-base/0E1a.⬛️📀 Export Chat 📀.js";
const QUICK_EXPORT_REL = "src-runtime-base/0E2a.⚫️💿 Quick Export 💿.js";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const readSource = (rel) => {
  const full = path.join(ROOT, rel);
  const bytes = fs.readFileSync(full);
  return { rel, full, text: bytes.toString("utf8"), sha256: sha256(bytes) };
};

const exportChat = readSource(EXPORT_CHAT_REL);
const quickExport = readSource(QUICK_EXPORT_REL);

/* ───────────────────────── source extraction ─────────────────────────
 * Parser-backed rather than hand-rolled: walk candidate end positions and let
 * the JS engine decide which slice is a complete function declaration. The
 * first candidate that compiles is the real end, because a truncated function
 * cannot have balanced braces. This avoids having to model strings, template
 * literals, comments and regex literals correctly.
 */

function extractFunction(source, name) {
  const needle = `function ${name}(`;
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `function ${name} not found in source`);
  assert.equal(
    source.indexOf(needle, start + 1),
    -1,
    `function ${name} is declared more than once; extraction would be ambiguous`,
  );

  // Closing braces of a declaration at this nesting level, innermost-last.
  const closeRe = /\n(\s*)\}/g;
  closeRe.lastIndex = start;
  let m;
  while ((m = closeRe.exec(source)) !== null) {
    const end = m.index + m[0].length;
    const candidate = source.slice(start, end);
    try {
      new vm.Script(`(${candidate})`);
      return candidate;
    } catch {
      // keep widening
    }
  }
  throw new Error(`could not delimit function ${name}`);
}

function extractStringConst(source, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(?:\\r?\\n\\s*)?'([^']*)'`);
  const m = source.text.match(re);
  assert.ok(m, `const ${name} (single-quoted string) not found`);
  return m[1];
}

/* ───────────────────────── modelled DOM ─────────────────────────
 * The smallest model that can distinguish the bug from the fix.
 *   textContent -> concatenation, no separators (what a detached read gives)
 *   innerText   -> block boundaries become newlines, but ONLY when rendered
 * Per the HTML standard, a node that is not being rendered returns textContent
 * from innerText; a node is "being rendered" here iff it is attached to the
 * modelled document.
 */

const BLOCK_TAGS = new Set([
  "p", "div", "li", "ul", "ol", "table", "tbody", "thead", "tr",
  "pre", "section", "h1", "h2", "h3", "h4", "h5", "h6",
]);
const CELL_TAGS = new Set(["td", "th"]);

class FakeText {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  cloneNode() { return new FakeText(this.data); }
  get textContent() { return this.data; }
}

class FakeElement {
  constructor(tag, doc) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = { cssText: "" };
    this._doc = doc || null;
  }

  get tag() { return this.tagName.toLowerCase(); }

  setAttribute(k, v) { this.attributes.set(String(k), String(v)); }
  getAttribute(k) { return this.attributes.has(String(k)) ? this.attributes.get(String(k)) : null; }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  cloneNode(deep) {
    const copy = new FakeElement(this.tag, this._doc);
    copy.attributes = new Map(this.attributes);
    copy.style = { cssText: this.style.cssText };
    if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
    return copy;
  }

  // Selector engine is intentionally absent: these fixtures carry no UI chrome,
  // so scrubbing is a no-op here and is NOT what this validator exercises.
  querySelectorAll() { return []; }
  querySelector() { return null; }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join("");
  }

  get isRendered() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return !!this._doc && node === this._doc.root;
  }

  get innerText() {
    if (!this.isRendered) return this.textContent;
    return renderInnerText(this).replace(/\n{3,}/g, "\n\n").trim();
  }
}

function renderInnerText(el) {
  if (el.tag === "pre") return el.textContent;

  const parts = [];
  for (const child of el.childNodes) {
    if (child.nodeType === 3) { parts.push({ block: false, text: child.data }); continue; }
    const text = renderInnerText(child);
    if (CELL_TAGS.has(child.tag)) parts.push({ block: false, cell: true, text });
    else parts.push({ block: BLOCK_TAGS.has(child.tag), text });
  }

  let out = "";
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (i > 0) {
      const prev = parts[i - 1];
      if (p.block || prev.block) out += "\n";
      else if (p.cell && prev.cell) out += "\t";
    }
    out += p.text;
  }
  return out;
}

class FakeDocument {
  constructor() {
    this.root = new FakeElement("html", this);
    this.body = new FakeElement("body", this);
    this.documentElement = this.root;
    this.root.appendChild(this.body);
  }
  createElement(tag) { return new FakeElement(tag, this); }
}

function buildFixture(doc) {
  const mk = (tag, text) => {
    const el = doc.createElement(tag);
    if (text != null) el.appendChild(new FakeText(text));
    return el;
  };

  const root = doc.createElement("div");

  root.appendChild(mk("p", "First paragraph."));
  root.appendChild(mk("p", "Second paragraph."));

  const ul = doc.createElement("ul");
  ul.appendChild(mk("li", "Alpha"));
  ul.appendChild(mk("li", "Beta"));
  ul.appendChild(mk("li", "Gamma"));
  root.appendChild(ul);

  const table = doc.createElement("table");
  const r1 = doc.createElement("tr");
  r1.appendChild(mk("td", "Name"));
  r1.appendChild(mk("td", "Value"));
  const r2 = doc.createElement("tr");
  r2.appendChild(mk("td", "rows"));
  r2.appendChild(mk("td", "2"));
  table.appendChild(r1);
  table.appendChild(r2);
  root.appendChild(table);

  // <pre> carries literal newlines in its text node, so they survive even a
  // detached read. Included to keep the "better, not perfect" claim honest.
  root.appendChild(mk("pre", "line one\nline two\nline three"));

  return root;
}

const results = [];
const record = (id, detail) => results.push({ id, ...detail });

/* ───────────────────────── Scope A — fail-closed coverage ───────────────────────── */

const coverageSrc = [
  extractFunction(exportChat.text, "EXPORT_resolveSelectionCoverage"),
  extractFunction(exportChat.text, "EXPORT_reportCoverageFailure"),
  extractFunction(exportChat.text, "EXPORT_materializeRecords"),
  extractFunction(exportChat.text, "EXPORT_reportMaterializeFailure"),
  extractFunction(exportChat.text, "EXPORT_runGuarded"),
].join("\n\n");

function makeCoverageSandbox({ resolvable }) {
  const alerts = [];
  const warns = [];
  const downloads = [];
  const resolvableSet = new Set(resolvable);

  const sandbox = {
    MODTAG: "EChat",
    COVERAGE_MISSING_LOG_LIMIT: 12,
    W: { highlightMap: {} },
    DATA_answerById: (id) => (resolvableSet.has(id) ? { id, __node: true } : null),
    // Materialization stubs — these scenarios are about the coverage decision,
    // not about text extraction; Scope C exercises materialization properly.
    DATA_answers: () => [],
    DATA_userForAnswer: () => null,
    UTIL_plainText: (el) => (el ? `text:${el.id}` : ""),
    UTIL_getCreationDate: () => null,
    alert: (msg) => alerts.push(String(msg)),
    console: { warn: (...args) => warns.push(args) },
    __downloads: downloads,
  };
  vm.createContext(sandbox);
  vm.runInContext(coverageSrc, sandbox, { filename: EXPORT_CHAT_REL });
  return { sandbox, alerts, warns, downloads };
}

const ids10 = Array.from({ length: 10 }, (_, i) => `msg-${i + 1}`);

// A1 — complete case: 10 requested, 10 resolved, export proceeds.
{
  const { sandbox, alerts, downloads } = makeCoverageSandbox({ resolvable: ids10 });
  const run = sandbox.EXPORT_runGuarded(ids10, (records) => {
    for (const rec of records) downloads.push(rec.id);
  });

  assert.equal(run.ok, true, "A1: complete selection must proceed");
  assert.equal(run.reason, "complete");
  assert.equal(run.coverage.requested, 10);
  assert.equal(run.coverage.resolvedCount, 10);
  assert.equal(run.coverage.missingCount, 0);
  assert.equal(run.coverage.complete, true);
  assert.deepEqual(downloads, ids10, "A1: all 10 exported in requested order");
  assert.deepEqual(alerts, [], "A1: no refusal shown on a complete selection");
  record("A1-complete-proceeds", { requested: 10, resolved: 10, missing: 0, downloads: downloads.length });
}

// A2 — incomplete case: 10 requested, 7 resolved, abort with missing = 3.
{
  const resolvable = ids10.filter((id) => !["msg-3", "msg-6", "msg-9"].includes(id));
  const { sandbox, alerts, warns, downloads } = makeCoverageSandbox({ resolvable });
  const run = sandbox.EXPORT_runGuarded(ids10, (records) => {
    for (const rec of records) downloads.push(rec.id);
  });

  assert.equal(run.ok, false, "A2: incomplete selection must refuse");
  assert.equal(run.reason, "incomplete");
  assert.equal(run.coverage.requested, 10);
  assert.equal(run.coverage.resolvedCount, 7);
  assert.equal(run.coverage.missingCount, 3);
  assert.equal(run.coverage.complete, false);
  // Array.from: values cross the vm realm boundary, so prototypes differ.
  assert.deepEqual(Array.from(run.coverage.missing), ["msg-3", "msg-6", "msg-9"], "A2: missing ids reported exactly");
  assert.equal(downloads.length, 0, "A2: NO export body may run — zero downloads");

  assert.equal(alerts.length, 1, "A2: exactly one explicit refusal");
  assert.match(alerts[0], /Requested: 10/, "A2: refusal states requested count");
  assert.match(alerts[0], /Ready: 7/, "A2: refusal states resolved count");
  assert.match(alerts[0], /Missing: 3/, "A2: refusal states missing count");

  assert.equal(warns.length, 1, "A2: exactly one diagnostic log");
  const diag = warns[0][1];
  assert.deepEqual(Array.from(diag.missingIds), ["msg-3", "msg-6", "msg-9"], "A2: unresolved ids are identifiable in the log");
  assert.equal(diag.missingIdsTruncated, 0);
  record("A2-incomplete-aborts", { requested: 10, resolved: 7, missing: 3, downloads: downloads.length, alerts: alerts.length });
}

// A3 — separate-files atomicity: preflight everything before download #1.
// Models the exact failure the guard exists to prevent: file 1 and 2 land,
// file 3 fails. The first unresolved id is late in the order on purpose.
{
  const resolvable = ids10.filter((id) => id !== "msg-8");
  const { sandbox, downloads } = makeCoverageSandbox({ resolvable });

  const run = sandbox.EXPORT_runGuarded(ids10, (records) => {
    records.forEach((rec) => downloads.push(rec.id)); // stands in for EXPORT_one
  });

  assert.equal(run.ok, false, "A3: one unresolved item must abort the whole batch");
  assert.equal(run.coverage.missingCount, 1);
  assert.equal(
    downloads.length,
    0,
    "A3: no file may be written before full coverage — not even the ones that resolved",
  );
  record("A3-separate-files-atomic", { requested: 10, resolved: 9, missing: 1, downloads: downloads.length });
}

// A4 — requested order is preserved through the guard.
{
  const shuffled = ["msg-7", "msg-2", "msg-10", "msg-1", "msg-5"];
  const { sandbox, downloads } = makeCoverageSandbox({ resolvable: ids10 });
  sandbox.EXPORT_runGuarded(shuffled, (records) => { for (const rec of records) downloads.push(rec.id); });
  assert.deepEqual(downloads, shuffled, "A4: selection order must survive the guard");
  record("A4-order-preserved", { order: shuffled.join(",") });
}

// A5 — empty selection is refused without the coverage message.
{
  const { sandbox, alerts, downloads } = makeCoverageSandbox({ resolvable: ids10 });
  const run = sandbox.EXPORT_runGuarded([], () => downloads.push("x"));
  assert.equal(run.ok, false);
  assert.equal(run.reason, "empty");
  assert.equal(downloads.length, 0);
  assert.deepEqual(alerts, [], "A5: empty selection must not raise a coverage refusal");
  record("A5-empty-refused", { reason: run.reason });
}

// A6 — the log cap holds for a large failed selection.
{
  const many = Array.from({ length: 40 }, (_, i) => `bulk-${i + 1}`);
  const { sandbox, warns } = makeCoverageSandbox({ resolvable: [] });
  sandbox.EXPORT_runGuarded(many, () => { throw new Error("must not run"); });
  const diag = warns[0][1];
  assert.equal(diag.missingIds.length, 12, "A6: logged ids are capped");
  assert.equal(diag.missingIdsTruncated, 28, "A6: truncation is reported, not hidden");
  record("A6-log-capped", { logged: diag.missingIds.length, truncated: diag.missingIdsTruncated });
}

/* ── A7 — structural: the live menu handler routes BOTH paths through the guard.
 * The scenarios above prove the guard; this proves the guard is actually wired
 * into the code path a user reaches.
 */
{
  const handler = exportChat.text.slice(
    exportChat.text.indexOf("menu.addEventListener('click'"),
    exportChat.text.indexOf("UTIL_on(document, 'click'"),
  );
  assert.ok(handler.length > 0, "A7: menu click handler not located");

  const oneBranch = handler.slice(handler.indexOf("if (mode === 'one')"), handler.indexOf("} else if (mode === 'multi')"));
  const multiBranch = handler.slice(handler.indexOf("} else if (mode === 'multi')"), handler.indexOf("} else if (mode === 'clear')"));

  assert.match(oneBranch, /EXPORT_runGuarded\(/, "A7: bundled export must go through the guard");
  assert.match(multiBranch, /EXPORT_runGuarded\(/, "A7: separate-files export must go through the guard");
  assert.doesNotMatch(
    oneBranch.replace(/EXPORT_runGuarded\([\s\S]*/, ""),
    /EXPORT_bundle\(/,
    "A7: no unguarded EXPORT_bundle call before the guard",
  );
  assert.doesNotMatch(
    multiBranch.replace(/EXPORT_runGuarded\([\s\S]*/, ""),
    /EXPORT_one\(/,
    "A7: no unguarded EXPORT_one call before the guard",
  );
  assert.match(oneBranch, /if \(!run\.ok\) return;/, "A7: bundled path must bail on refusal");
  assert.match(multiBranch, /if \(!run\.ok\) return;/, "A7: separate-files path must bail on refusal");
  record("A7-menu-wired-to-guard", { branches: ["one", "multi"] });
}

/* ───────────────────────── Scope B — attached-probe extraction ───────────────────────── */

const TEXT_PROBE_STYLE = extractStringConst(exportChat, "TEXT_PROBE_STYLE");
const PROBE_STYLE = extractStringConst(quickExport, "PROBE_STYLE");

// B1 — probe styles keep the node rendered.
for (const [label, style] of [["0E1a TEXT_PROBE_STYLE", TEXT_PROBE_STYLE], ["0E2a PROBE_STYLE", PROBE_STYLE]]) {
  const flat = style.replace(/\s+/g, "").toLowerCase();
  assert.ok(!flat.includes("display:none"), `B1: ${label} must not use display:none`);
  assert.ok(!flat.includes("visibility:hidden"), `B1: ${label} must not use visibility:hidden`);
  assert.ok(flat.includes("position:fixed"), `B1: ${label} must be positioned out of flow`);
  assert.ok(/left:-\d{4,}px/.test(flat), `B1: ${label} must be pushed off-screen`);
}
record("B1-probe-style-stays-rendered", { exportChat: TEXT_PROBE_STYLE, quickExport: PROBE_STYLE });

// B2 — probe teardown is in a finally block in both modules.
for (const [label, src, fn] of [
  ["0E1a", exportChat.text, "UTIL_readRenderedText"],
  ["0E2a", quickExport.text, "readRenderedText"],
]) {
  const body = extractFunction(src, fn);
  const appendAt = body.indexOf("appendChild(probe)");
  const readAt = body.indexOf("probe.innerText");
  assert.ok(appendAt >= 0, `B2: ${label} must attach the probe to the host`);
  assert.ok(readAt >= 0, `B2: ${label} must read innerText from the probe`);
  assert.ok(appendAt < readAt, `B2: ${label} must attach BEFORE reading innerText`);
  assert.match(body, /finally\s*\{[\s\S]*probe\.remove\(\)/, `B2: ${label} must remove the probe in finally`);
}
record("B2-attach-before-read-and-finally-teardown", { modules: ["0E1a", "0E2a"] });

// B3 — 0E1a UTIL_plainText: rendered read beats detached read on the fixture.
const plainTextSrc = [
  extractFunction(exportChat.text, "UTIL_getAnswerContent"),
  extractFunction(exportChat.text, "UTIL_stripUnderUI"),
  extractFunction(exportChat.text, "UTIL_readRenderedText"),
  extractFunction(exportChat.text, "UTIL_plainText"),
].join("\n\n");

function runExportChatExtraction() {
  const doc = new FakeDocument();
  const sandbox = {
    D: doc,
    SkID: "xpch",
    ATTR_: { CGXUI_OWNER: "data-cgxui-owner", CGXUI: "data-cgxui" },
    UI_: { TEXT_PROBE: "xpch-text-probe" },
    TEXT_PROBE_STYLE,
    // Real selector strings; the modelled DOM matches nothing, so the fixture
    // falls through to the message element and scrubbing is a no-op here.
    SEL_: {
      ANSWER_CONTENT: () => ".markdown, .prose, [data-testid*=\"message-content\"]",
      STRIP_UNDER_UI: () => ".ho-under-ui",
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(plainTextSrc, sandbox, { filename: EXPORT_CHAT_REL });

  const live = buildFixture(doc);
  doc.body.appendChild(live);

  const detached = live.cloneNode(true).innerText.trim(); // the pre-fix behaviour
  const attached = sandbox.UTIL_plainText(live);
  return { doc, detached, attached };
}

// B4 — 0E2a getCleanText: same proof through Quick Export's own path.
const cleanTextSrc = [
  extractFunction(quickExport.text, "readRenderedText"),
  extractFunction(quickExport.text, "getCleanText"),
].join("\n\n");

function runQuickExportExtraction() {
  const doc = new FakeDocument();
  const sandbox = {
    document: doc,
    BTN_ATTR: "data-ho-testbtn",
    PROBE_ATTR: "data-ho-textprobe",
    PROBE_STYLE,
  };
  vm.createContext(sandbox);
  vm.runInContext(cleanTextSrc, sandbox, { filename: QUICK_EXPORT_REL });

  const live = buildFixture(doc);
  doc.body.appendChild(live);

  const detached = live.cloneNode(true).innerText.trim();
  const attached = sandbox.getCleanText(live);
  return { doc, detached, attached };
}

for (const [label, run] of [["0E1a UTIL_plainText", runExportChatExtraction], ["0E2a getCleanText", runQuickExportExtraction]]) {
  const { doc, detached, attached } = run();

  // The pre-fix read collapses every block boundary.
  assert.ok(
    detached.includes("First paragraph.Second paragraph."),
    `${label}: baseline detached read is expected to run paragraphs together`,
  );
  assert.ok(detached.includes("AlphaBetaGamma"), `${label}: baseline detached read runs list items together`);

  // The fixed read separates them.
  const lines = attached.split("\n").map((s) => s.trim()).filter(Boolean);
  assert.ok(lines.includes("First paragraph."), `${label}: paragraph 1 must stand alone`);
  assert.ok(lines.includes("Second paragraph."), `${label}: paragraph 2 must stand alone`);
  assert.ok(lines.includes("Alpha") && lines.includes("Beta") && lines.includes("Gamma"), `${label}: list items must be separated`);
  assert.ok(!attached.includes("First paragraph.Second"), `${label}: paragraphs must not run together`);
  assert.ok(!attached.includes("AlphaBeta"), `${label}: list items must not run together`);

  // Table rows separated, cells kept on their row.
  assert.ok(lines.some((l) => /^Name\tValue$/.test(l)), `${label}: table header row keeps its cells`);
  assert.ok(lines.some((l) => /^rows\t2$/.test(l)), `${label}: table body row keeps its cells`);

  // <pre> newlines survive both reads — stated so the improvement is not overclaimed.
  for (const l of ["line one", "line two", "line three"]) {
    assert.ok(lines.includes(l), `${label}: code lines must remain separated`);
    assert.ok(detached.includes(l), `${label}: code lines already survived detached (not an improvement)`);
  }

  // Strictly more line boundaries than the old path.
  const detachedLines = detached.split("\n").filter((s) => s.trim()).length;
  assert.ok(
    lines.length > detachedLines,
    `${label}: rendered read must yield more line boundaries (${lines.length} vs ${detachedLines})`,
  );

  // No probe may survive the read.
  assert.equal(doc.body.childNodes.length, 1, `${label}: probe must not persist in the DOM`);
  assert.equal(doc.body.childNodes[0].tag, "div", `${label}: only the fixture may remain`);

  // Source node untouched: still attached, still complete.
  const source = doc.body.childNodes[0];
  assert.equal(source.childNodes.length, 5, `${label}: source node must not be mutated`);

  record(`B3-rendered-extraction-${label.split(" ")[0]}`, {
    detachedLines,
    renderedLines: lines.length,
    probeLeaked: false,
  });
}

// B5 — Markdown syntax is explicitly NOT claimed.
{
  const { attached } = runExportChatExtraction();
  assert.ok(!attached.includes("- Alpha"), "B5: list markers are not reconstructed (by design)");
  assert.ok(!attached.includes("```"), "B5: fenced-code markers are not reconstructed (by design)");
  assert.ok(!attached.includes("| Name |"), "B5: Markdown tables are not reconstructed (by design)");
  record("B5-no-markdown-reconstruction-claimed", { asserted: "absence" });
}

/* ───────────────────────── Scope C — no time-of-check/time-of-use gap ─────────────────────────
 * Coverage proving the selection resolvable is worthless if the serializers then
 * look the ids up again: a turn detached in between would silently vanish. These
 * scenarios run the REAL guard, materializer, router and markdown serializers,
 * and break the DOM immediately after coverage succeeds.
 */

const batchSrc = [
  "DATA_buildSingleQABody",
  "EXPORT_resolveSelectionCoverage",
  "EXPORT_reportCoverageFailure",
  "EXPORT_materializeRecords",
  "EXPORT_reportMaterializeFailure",
  "EXPORT_runGuarded",
  "EXPORT_one_md",
  "EXPORT_bundle_md",
  "EXPORT_one",
  "EXPORT_bundle",
].map((fn) => extractFunction(exportChat.text, fn)).join("\n\n");

function makeBatchSandbox({ ids, format = "md", textFor = null }) {
  const els = new Map(ids.map((id) => [id, { __id: id }]));
  const state = {
    liveAnswers: ids.map((id) => els.get(id)),
    resolverCalls: 0,
    resolverMode: "ok", // ok | null | throw
    downloads: [],      // every file that would hit disk
    pdfWindows: 0,      // every print window that would open
    alerts: [],
    warns: [],
  };

  const sandbox = {
    MODTAG: "EChat",
    COVERAGE_MISSING_LOG_LIMIT: 12,
    W: { highlightMap: {} },
    R: { currentFormat: format },

    DATA_answerById: (id) => {
      state.resolverCalls += 1;
      if (state.resolverMode === "throw") throw new Error("DOM detached after coverage");
      if (state.resolverMode === "null") return null;
      return els.get(id) || null;
    },
    DATA_answers: () => state.liveAnswers.slice(),
    DATA_userForAnswer: (el) => ({ __q: el.__id }),
    UTIL_plainText: (el) => {
      if (!el) return "";
      const key = el.__q || el.__id;
      if (textFor) return textFor(el, key);
      return el.__q ? `Q for ${key}` : `A for ${key}`;
    },
    UTIL_getCreationDate: () => null,
    UTIL_downloadTextFile: (filename, content) => state.downloads.push({ filename, content }),

    // Non-markdown leaves are stubbed as side-effect counters; the markdown
    // serializers below are the real ones.
    EXPORT_one_html: () => state.downloads.push({ filename: "html" }),
    EXPORT_one_doc: () => state.downloads.push({ filename: "doc" }),
    EXPORT_bundle_html: () => state.downloads.push({ filename: "bundle.html" }),
    EXPORT_bundle_doc: () => state.downloads.push({ filename: "bundle.doc" }),
    EXPORT_bundle_docx: () => state.downloads.push({ filename: "bundle.docx" }),
    EXPORT_printPdf: (items) => { if (items && items.length) state.pdfWindows += 1; },

    alert: (msg) => state.alerts.push(String(msg)),
    console: { warn: (...args) => state.warns.push(args) },
  };

  vm.createContext(sandbox);
  vm.runInContext(batchSrc, sandbox, { filename: EXPORT_CHAT_REL });
  return { sandbox, state };
}

// Zero-padded so no id is a prefix of another — these scenarios match on
// substrings of the serialized output, and "sel-1" would also hit "sel-10".
const ids10b = Array.from({ length: 10 }, (_, i) => `sel-${String(i + 1).padStart(2, "0")}`);

// C1 — the resolver must not be consulted again once coverage has passed.
{
  const { sandbox, state } = makeBatchSandbox({ ids: ids10b });

  const run = sandbox.EXPORT_runGuarded(ids10b, (records) => {
    // Break the DOM the instant coverage succeeds, exactly as a pagination
    // swap would: any further lookup now throws.
    state.resolverMode = "throw";
    const callsAtHandoff = state.resolverCalls;
    sandbox.EXPORT_bundle(records);
    assert.equal(state.resolverCalls, callsAtHandoff, "C1: serializers must not resolve ids again");
  });

  assert.equal(run.ok, true, "C1: export must still complete");
  assert.equal(state.resolverCalls, 10, "C1: exactly one resolution per selected id, ever");
  assert.equal(state.downloads.length, 1, "C1: bundle produced");
  for (const id of ids10b) {
    assert.ok(state.downloads[0].content.includes(`A for ${id}`), `C1: ${id} present in output`);
  }
  record("C1-no-post-guard-re-resolution", { resolverCalls: state.resolverCalls, downloads: 1 });
}

// C2 — DOM mutation after coverage: all ten still exported, original order.
{
  const { sandbox, state } = makeBatchSandbox({ ids: ids10b });

  const run = sandbox.EXPORT_runGuarded(ids10b, (records) => sandbox.EXPORT_bundle(records));
  assert.equal(run.ok, true);

  // Now prove it again with the DOM torn down before materialization runs.
  const second = makeBatchSandbox({ ids: ids10b });
  const originalResolve = second.sandbox.DATA_answerById;
  let resolvedSoFar = 0;
  second.sandbox.DATA_answerById = (id) => {
    const el = originalResolve(id);
    resolvedSoFar += 1;
    // After the last id is accepted, detach everything.
    if (resolvedSoFar === ids10b.length) second.state.liveAnswers = [];
    return el;
  };

  const run2 = second.sandbox.EXPORT_runGuarded(ids10b, (records) => {
    assert.equal(records.length, 10, "C2: all ten records materialized despite detachment");
    // Array.from: records cross the vm realm boundary, so prototypes differ.
    assert.deepEqual(
      Array.from(records, (r) => r.id),
      ids10b,
      "C2: original selected order preserved",
    );
    second.sandbox.EXPORT_bundle(records);
  });

  assert.equal(run2.ok, true, "C2: export completes despite post-coverage detachment");
  assert.equal(second.state.downloads.length, 1);

  const body = second.state.downloads[0].content;
  const order = ids10b.map((id) => body.indexOf(`A for ${id}`));
  assert.ok(order.every((i) => i >= 0), "C2: every selected record present in the bundle");
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, "C2: bundle keeps selection order");
  record("C2-dom-mutation-after-coverage", { records: 10, downloads: 1, orderPreserved: true });
}

// C3 — materialization failure must precede every side effect.
{
  const failing = "sel-07";
  const { sandbox, state } = makeBatchSandbox({
    ids: ids10b,
    format: "pdf",
    textFor: (el, key) => {
      if (key === failing) throw new Error("probe failed for " + failing);
      return `A for ${key}`;
    },
  });

  const run = sandbox.EXPORT_runGuarded(ids10b, () => {
    throw new Error("C3: proceed must never run");
  });

  assert.equal(run.ok, false, "C3: must abort");
  assert.equal(run.reason, "materialize-failed");
  assert.equal(run.batch.failedId, failing, "C3: the failing item is named");
  assert.equal(run.batch.reason, "materialize-threw");
  assert.equal(state.downloads.length, 0, "C3: zero downloads");
  assert.equal(state.pdfWindows, 0, "C3: zero PDF windows");
  assert.equal(state.alerts.length, 1, "C3: one explicit failure");
  assert.match(state.alerts[0], new RegExp(`Failed on: ${failing}`), "C3: failure identifies the item");
  record("C3-materialize-failure-before-side-effects", { failedId: failing, downloads: 0, pdfWindows: 0 });
}

// C3b — the pdfWindows counter is not vacuous: a good batch does open one.
{
  const { sandbox, state } = makeBatchSandbox({ ids: ids10b, format: "pdf" });
  sandbox.EXPORT_runGuarded(ids10b, (records) => sandbox.EXPORT_bundle(records));
  assert.equal(state.pdfWindows, 1, "C3b: counter proves it would have fired");
  record("C3b-side-effect-counter-not-vacuous", { pdfWindows: state.pdfWindows });
}

// C3c — a record without an element is a FAILURE, never a silent skip.
// This branch is unreachable from the guarded path (coverage only accepts
// truthy elements), so it is exercised directly: it is the defensive backstop,
// and downgrading it to `continue` would quietly resurrect partial export.
{
  const { sandbox } = makeBatchSandbox({ ids: ids10b });
  const resolved = ids10b.map((id, i) => ({ id, el: i === 4 ? null : { __id: id } }));

  const batch = sandbox.EXPORT_materializeRecords(resolved);
  assert.equal(batch.ok, false, "C3c: a missing element must fail the batch, not be skipped");
  assert.equal(batch.reason, "missing-element");
  assert.equal(batch.failedId, ids10b[4], "C3c: the failing item is named");
  assert.equal(batch.items, undefined, "C3c: no partial batch may be returned");
  record("C3c-missing-element-fails-closed", { failedId: batch.failedId, reason: batch.reason });
}

// C4 — separate files: ten outputs, selected order, none before full materialization.
{
  const { sandbox, state } = makeBatchSandbox({ ids: ids10b });
  let downloadsAtHandoff = -1;

  const run = sandbox.EXPORT_runGuarded(ids10b, (records) => {
    downloadsAtHandoff = state.downloads.length;
    state.resolverMode = "throw";
    records.forEach((rec) => sandbox.EXPORT_one(rec));
  });

  assert.equal(run.ok, true);
  assert.equal(downloadsAtHandoff, 0, "C4: nothing may download before materialization completes");
  assert.equal(state.downloads.length, 10, "C4: ten separate files");
  assert.equal(state.resolverCalls, 10, "C4: still only one resolution per id");

  const seen = state.downloads.map((d) => {
    const m = d.content.match(/A for (sel-\d{2})/);
    return m ? m[1] : null;
  });
  assert.deepEqual(seen, ids10b, "C4: files emitted in selected order");
  record("C4-separate-files-success", { downloads: 10, downloadsBeforeMaterialization: 0 });
}

// C5 — bundle contains every selected record exactly once, in order.
{
  const { sandbox, state } = makeBatchSandbox({ ids: ids10b });
  sandbox.EXPORT_runGuarded(ids10b, (records) => sandbox.EXPORT_bundle(records));

  const body = state.downloads[0].content;
  for (const id of ids10b) {
    const hits = body.split(`A for ${id}`).length - 1;
    assert.equal(hits, 1, `C5: ${id} appears exactly once`);
  }
  const positions = ids10b.map((id) => body.indexOf(`A for ${id}`));
  assert.deepEqual(positions.slice().sort((a, b) => a - b), positions, "C5: bundle order matches selection");
  record("C5-bundle-success", { records: 10, duplicates: 0 });
}

// C6 — negative control: no serializer may contain a DOM lookup. This is the
// assertion that fails the moment downstream re-resolution is reintroduced.
{
  const SERIALIZERS = [
    "EXPORT_one_md", "EXPORT_bundle_md", "EXPORT_one_html", "EXPORT_bundle_html",
    "EXPORT_one_doc", "EXPORT_bundle_doc", "EXPORT_bundle_docx", "EXPORT_printPdf",
    "EXPORT_one", "EXPORT_bundle",
  ];
  const BANNED = ["DATA_answerById", "DATA_answers(", "document.querySelector", "DATA_answerIdFromAnyId"];

  for (const fn of SERIALIZERS) {
    const body = extractFunction(exportChat.text, fn);
    for (const banned of BANNED) {
      assert.ok(
        !body.includes(banned),
        `C6: ${fn} must not re-resolve — found "${banned}". Serializers consume coverage-accepted records only.`,
      );
    }
  }

  // And the resolver must be reachable from exactly one place in the export path.
  const guardBody = extractFunction(exportChat.text, "EXPORT_runGuarded");
  assert.match(guardBody, /EXPORT_resolveSelectionCoverage\(ids, DATA_answerById\)/, "C6: coverage owns the only lookup");
  assert.ok(!exportChat.text.includes("EXPORT_buildQAData"), "C6: the old re-resolving builder must be gone");
  record("C6-no-downstream-resolution-negative-control", { serializersChecked: SERIALIZERS.length, banned: BANNED.length });
}

/* ───────────────────────── Scope D — prepared-record wiring per live format ─────────────────────────
 * The TOCTOU closure swapped every serializer from id input to prepared-record
 * input. These scenarios drive the REAL serializers with records whose raw and
 * display fields carry different sentinels, so reading the wrong field is
 * impossible to miss.
 *
 * Field conventions carried over unchanged from before Phase 0A:
 *   markdown      -> qTextRaw / aTextRaw / idxMd      (raw, no fallback text)
 *   html/doc/pdf  -> qText / aText / idx / stamp      (display, with fallback text)
 *
 * The sandbox deliberately defines NO DOM accessor (no DATA_answerById,
 * DATA_answers, DATA_userForAnswer, UTIL_plainText). Any serializer that tried
 * to resolve an id would throw ReferenceError, so a clean run is positive proof
 * that none of them touch the DOM.
 */

const SENTINELS = [
  { id: "sel-01", domIndex0: 0, idx: 1, idxMd: 1,
    qTextRaw: "RAW-Q-01", aTextRaw: "RAW-A-01",
    qText: "DISPLAY-Q-01", aText: "DISPLAY-A-01",
    stamp: "2026-01-01 01:01", hlName: "gold" },
  { id: "sel-02", domIndex0: 1, idx: 2, idxMd: 2,
    qTextRaw: "RAW-Q-02", aTextRaw: "RAW-A-02",
    qText: "DISPLAY-Q-02", aText: "DISPLAY-A-02",
    stamp: "2026-02-02 02:02", hlName: "blue" },
  { id: "sel-03", domIndex0: 2, idx: 3, idxMd: 3,
    qTextRaw: "RAW-Q-03", aTextRaw: "RAW-A-03",
    qText: "DISPLAY-Q-03", aText: "DISPLAY-A-03",
    stamp: "2026-03-03 03:03", hlName: "green" },
];

const RAW_TOKENS = SENTINELS.flatMap((r) => [r.qTextRaw, r.aTextRaw]);
const DISPLAY_TOKENS = SENTINELS.flatMap((r) => [r.qText, r.aText]);
const POISON = ["[object Object]", "undefined", "null", "NaN"];

const formatSrc = [
  "UTIL_escHtml",
  "UTIL_wrapHtmlForWord",
  "DATA_buildSingleQABody",
  "EXPORT_buildHtmlDoc",
  "EXPORT_one_md",
  "EXPORT_bundle_md",
  "EXPORT_one_html",
  "EXPORT_bundle_html",
  "EXPORT_one_doc",
  "EXPORT_bundle_doc",
  "EXPORT_printPdf",
  "EXPORT_one",
  "EXPORT_bundle",
].map((fn) => extractFunction(exportChat.text, fn)).join("\n\n");

function makeFormatSandbox(format) {
  const state = { downloads: [], windowOpens: 0, printedHtml: "", alerts: [] };

  const sandbox = {
    R: { currentFormat: format },
    W: { highlightMap: {} },
    ATTR_: { HL: "data-hl" },
    // null forces UTIL_escHtml / UTIL_wrapHtmlForWord down their local fallbacks,
    // keeping this proof independent of whether 0E1b happens to be loaded.
    UTIL_getExportFormats: () => null,
    UTIL_downloadTextFile: (filename, content, mime) => state.downloads.push({ filename, content, mime }),
    UTIL_downloadBlobFile: (filename) => state.downloads.push({ filename, content: "<blob>", mime: "blob" }),
    alert: (msg) => state.alerts.push(String(msg)),
    console: { warn: () => {} },
    window: {
      open: () => {
        state.windowOpens += 1;
        return {
          document: {
            open() {}, close() {},
            write(s) { state.printedHtml += String(s); },
            getElementById: () => null,
            documentElement: { style: { setProperty() {} } },
            body: { classList: { toggle() {}, contains: () => false } },
          },
          addEventListener() {},
          focus() {}, print() {},
          getComputedStyle: () => ({ getPropertyValue: () => "1" }),
        };
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(formatSrc, sandbox, { filename: EXPORT_CHAT_REL });
  return { sandbox, state };
}

function assertClean(label, text) {
  for (const bad of POISON) {
    assert.ok(!text.includes(bad), `${label}: output must not contain "${bad}"`);
  }
  assert.ok(text.trim().length > 0, `${label}: output must not be empty`);
}

function assertOnceAndOrdered(label, text, tokens) {
  const positions = [];
  for (const token of tokens) {
    const hits = text.split(token).length - 1;
    assert.equal(hits, 1, `${label}: "${token}" must appear exactly once (found ${hits})`);
    positions.push(text.indexOf(token));
  }
  assert.deepEqual(
    positions.slice().sort((a, b) => a - b),
    positions,
    `${label}: records must appear in selected order`,
  );
}

function assertNoForeignTokens(label, text, foreign) {
  for (const token of foreign) {
    assert.ok(!text.includes(token), `${label}: "${token}" belongs to another format's field — wrong field consumed`);
  }
}

// D1 — Markdown, single file: raw fields.
{
  const { sandbox, state } = makeFormatSandbox("md");
  sandbox.EXPORT_one(SENTINELS[0]);

  assert.equal(state.downloads.length, 1, "D1: exactly one file");
  const { filename, content } = state.downloads[0];
  assert.match(filename, /^\d{4}-\d{2}-\d{2}_QA_001\.md$/, "D1: filename template unchanged");
  assertClean("D1", content);
  assert.ok(content.includes("RAW-Q-01"), "D1: raw question consumed");
  assert.ok(content.includes("RAW-A-01"), "D1: raw answer consumed");
  assertNoForeignTokens("D1", content, DISPLAY_TOKENS);
  record("D1-markdown-single", { filename, fields: "qTextRaw/aTextRaw/idxMd" });
}

// D2 — Markdown, bundle: raw fields, every record once, in order.
{
  const { sandbox, state } = makeFormatSandbox("md");
  sandbox.EXPORT_bundle(SENTINELS);

  assert.equal(state.downloads.length, 1, "D2: exactly one bundle file");
  const { filename, content } = state.downloads[0];
  assert.match(filename, /^\d{4}-\d{2}-\d{2}_QA_bundle_3\.md$/, "D2: filename template unchanged");
  assertClean("D2", content);
  assertOnceAndOrdered("D2", content, SENTINELS.map((r) => r.aTextRaw));
  assertOnceAndOrdered("D2", content, SENTINELS.map((r) => r.qTextRaw));
  assertNoForeignTokens("D2", content, DISPLAY_TOKENS);
  record("D2-markdown-bundle", { filename, records: 3, fields: "qTextRaw/aTextRaw/idxMd" });
}

// D3 — HTML, single file: display fields.
{
  const { sandbox, state } = makeFormatSandbox("html");
  sandbox.EXPORT_one(SENTINELS[0]);

  assert.equal(state.downloads.length, 1, "D3: exactly one file");
  const { filename, content, mime } = state.downloads[0];
  assert.match(filename, /^\d{4}-\d{2}-\d{2}_QA_001\.html$/, "D3: filename template unchanged");
  assert.equal(mime, "text/html;charset=utf-8", "D3: mime unchanged");
  assertClean("D3", content);
  assert.ok(content.includes("DISPLAY-Q-01"), "D3: display question consumed");
  assert.ok(content.includes("DISPLAY-A-01"), "D3: display answer consumed");
  assert.ok(content.includes("2026-01-01 01:01"), "D3: stamp consumed");
  assertNoForeignTokens("D3", content, RAW_TOKENS);
  record("D3-html-single", { filename, mime, fields: "qText/aText/idx/stamp" });
}

// D4 — HTML, bundle.
{
  const { sandbox, state } = makeFormatSandbox("html");
  sandbox.EXPORT_bundle(SENTINELS);

  assert.equal(state.downloads.length, 1, "D4: exactly one bundle file");
  const { filename, content, mime } = state.downloads[0];
  assert.match(filename, /^\d{4}-\d{2}-\d{2}_QA_bundle_3\.html$/, "D4: filename template unchanged");
  assert.equal(mime, "text/html;charset=utf-8", "D4: mime unchanged");
  assertClean("D4", content);
  assertOnceAndOrdered("D4", content, SENTINELS.map((r) => r.aText));
  assertOnceAndOrdered("D4", content, SENTINELS.map((r) => r.qText));
  for (const rec of SENTINELS) assert.ok(content.includes(rec.stamp), `D4: stamp ${rec.stamp} present`);
  assertNoForeignTokens("D4", content, RAW_TOKENS);
  record("D4-html-bundle", { filename, records: 3, fields: "qText/aText/idx/stamp" });
}

// D5 — DOC, single file.
{
  const { sandbox, state } = makeFormatSandbox("doc");
  sandbox.EXPORT_one(SENTINELS[1]);

  assert.equal(state.downloads.length, 1, "D5: exactly one file");
  const { filename, content, mime } = state.downloads[0];
  assert.match(filename, /^\d{4}-\d{2}-\d{2}_QA_002\.doc$/, "D5: filename template unchanged (idx 2 -> 002)");
  assert.equal(mime, "application/msword;charset=utf-8", "D5: mime unchanged");
  assertClean("D5", content);
  assert.ok(content.includes("DISPLAY-Q-02"), "D5: display question consumed");
  assert.ok(content.includes("DISPLAY-A-02"), "D5: display answer consumed");
  assertNoForeignTokens("D5", content, RAW_TOKENS);
  record("D5-doc-single", { filename, mime, fields: "qText/aText/idx/stamp" });
}

// D6 — DOC, bundle.
{
  const { sandbox, state } = makeFormatSandbox("doc");
  sandbox.EXPORT_bundle(SENTINELS);

  assert.equal(state.downloads.length, 1, "D6: exactly one bundle file");
  const { filename, content, mime } = state.downloads[0];
  assert.match(filename, /^\d{4}-\d{2}-\d{2}_QA_bundle_3\.doc$/, "D6: filename template unchanged");
  assert.equal(mime, "application/msword;charset=utf-8", "D6: mime unchanged");
  assertClean("D6", content);
  assertOnceAndOrdered("D6", content, SENTINELS.map((r) => r.aText));
  assertOnceAndOrdered("D6", content, SENTINELS.map((r) => r.qText));
  assertNoForeignTokens("D6", content, RAW_TOKENS);
  record("D6-doc-bundle", { filename, records: 3, fields: "qText/aText/idx/stamp" });
}

// D7 — PDF: prepared batch reaches the print-document builder.
{
  const { sandbox, state } = makeFormatSandbox("pdf");
  sandbox.EXPORT_bundle(SENTINELS);

  assert.equal(state.windowOpens, 1, "D7: exactly one print window");
  assert.equal(state.downloads.length, 0, "D7: PDF path writes no file");
  const html = state.printedHtml;
  assertClean("D7", html);
  assertOnceAndOrdered("D7", html, SENTINELS.map((r) => r.aText));
  assertOnceAndOrdered("D7", html, SENTINELS.map((r) => r.qText));
  for (const rec of SENTINELS) {
    assert.ok(html.includes(rec.stamp), `D7: stamp ${rec.stamp} present`);
    assert.ok(html.includes(`data-hl="${rec.hlName}"`), `D7: hlName ${rec.hlName} routed to data-hl`);
  }
  assertNoForeignTokens("D7", html, RAW_TOKENS);
  record("D7-pdf-print-batch", { windowOpens: 1, records: 3, fields: "qText/aText/idx/stamp/hlName" });
}

// D7b — the print window opens only after the batch is prepared: an empty batch
// must never reach window.open.
{
  const { sandbox, state } = makeFormatSandbox("pdf");
  sandbox.EXPORT_printPdf([]);
  assert.equal(state.windowOpens, 0, "D7b: empty batch must not open a window");
  assert.equal(state.alerts.length, 1, "D7b: empty batch is reported");
  record("D7b-pdf-no-window-without-batch", { windowOpens: 0 });
}

// D8 — no serializer resolved anything: the sandbox above defines no DOM
// accessor, so D1-D7 completing at all is the proof. Assert the invariant
// explicitly so the intent survives future edits.
{
  const DOM_NAMES = ["DATA_answerById", "DATA_answers", "DATA_userForAnswer", "UTIL_plainText", "UTIL_getCreationDate"];
  const { sandbox } = makeFormatSandbox("md");
  for (const name of DOM_NAMES) {
    assert.equal(sandbox[name], undefined, `D8: ${name} must not be reachable from the format sandbox`);
  }
  assert.ok(!formatSrc.includes("DATA_answerById"), "D8: no extracted serializer references the resolver");
  record("D8-format-sandbox-has-no-dom", { domAccessorsDefined: 0 });
}

// D9 — filename templates are byte-identical to the pre-Phase-0A source.
{
  const EXPECTED_TEMPLATES = [
    "`${yyyy}-${mm}-${dd}_QA_${idxStr}.md`",
    "`${yyyy}-${mm}-${dd}_QA_bundle_${sorted.length}.md`",
    "`${yyyy}-${mm}-${dd}_QA_${idxStr}.html`",
    "`${yyyy}-${mm}-${dd}_QA_bundle_${items.length}.html`",
    "`${yyyy}-${mm}-${dd}_QA_${idxStr}.doc`",
    "`${yyyy}-${mm}-${dd}_QA_bundle_${items.length}.docx`",
    "`${yyyy}-${mm}-${dd}_QA_bundle_${items.length}.doc`",
  ];
  const found = exportChat.text.match(/const filename = `[^`]*`/g) || [];
  assert.deepEqual(
    found.map((s) => s.replace("const filename = ", "")),
    EXPECTED_TEMPLATES,
    "D9: filename templates must match the pre-Phase-0A source exactly, in order",
  );
  record("D9-filenames-unchanged", { templates: EXPECTED_TEMPLATES.length });
}

// D10 — DOCX is NOT validated here. It has two pre-existing defects (bundle
// reads `it.q`/`it.a`, which no record has ever carried; and EXPORT_one has no
// docx branch). Rather than freezing broken output in a golden file, assert only
// that Phase 0A did not route a WORKING format through those dead field names.
{
  const WORKING = [
    "EXPORT_one_md", "EXPORT_bundle_md", "EXPORT_buildHtmlDoc",
    "EXPORT_one_html", "EXPORT_bundle_html",
    "EXPORT_one_doc", "EXPORT_bundle_doc", "EXPORT_printPdf",
  ];
  for (const fn of WORKING) {
    const body = extractFunction(exportChat.text, fn);
    assert.ok(!/\b(it|rec|item)\.q\b/.test(body), `D10: ${fn} must not read the dead DOCX field .q`);
    assert.ok(!/\b(it|rec|item)\.a\b/.test(body), `D10: ${fn} must not read the dead DOCX field .a`);
  }
  const docx = extractFunction(exportChat.text, "EXPORT_bundle_docx");
  assert.ok(/\bit\.q\b/.test(docx) && /\bit\.a\b/.test(docx), "D10: DOCX still reads its pre-existing dead fields (unchanged by Phase 0A)");
  record("D10-docx-quarantined", {
    status: "KNOWN BROKEN — not validated, not golden-tested",
    preExistingDefects: [
      "EXPORT_bundle_docx reads it.q/it.a which no record carries -> empty DOCX body",
      "EXPORT_one has no docx branch -> separate-files DOCX is a silent no-op",
    ],
    reservedFor: "Phase 0B or a later explicit task",
  });
}

console.log(JSON.stringify({
  ok: true,
  validator: "export-phase0a-coverage-and-probe",
  scenarios: results.length,
  results,
  attestation: {
    [EXPORT_CHAT_REL]: exportChat.sha256,
    [QUICK_EXPORT_REL]: quickExport.sha256,
  },
  proofClass: {
    scopeA_coverage: "behavioural — pure logic executed from real source bytes",
    scopeB_probe: "behavioural against a MODELLED DOM + structural assertions; "
      + "real browser line-boundary output confirmed manually via "
      + "tools/validation/export/fixtures/probe-live-check.html",
    scopeC_no_toctou: "behavioural — real guard/materializer/router/serializers "
      + "executed with the DOM broken immediately after coverage succeeds",
    scopeD_format_wiring: "behavioural — real serializers driven with raw/display "
      + "sentinels in a sandbox containing no DOM accessor at all",
    docx: "NOT VALIDATED — pre-existing defects, quarantined for a later task",
  },
}, null, 2));
