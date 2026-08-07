#!/usr/bin/env node
/**
 * Export Phase 0B validator — truthful archive PDF outcome.
 *
 * Defect repaired:
 *   0E1b downloadPDF called window.open('', '_blank', 'noopener,noreferrer').
 *   Per the HTML standard's window open steps, `noopener` makes window.open
 *   return null, so the handle check always failed and the function always
 *   returned false — while the browser had already opened a blank tab. 0Z1b
 *   discarded that result and reported success regardless.
 *
 * Scope: archive PDF only. Nothing here asserts anything about Markdown
 * fidelity, archive whitespace, DOCX, or the live Export Chat PDF path.
 *
 * Method: the real downloadPDF (0E1b) and the real archive-PDF dispatch
 * (DATA_exportLatestArchive2 in 0Z1b) are extracted from the shipped source
 * bytes and executed in node:vm against a modelled window/document. No
 * re-implementation, no dependencies, no network, no port 5500, no alias or
 * generated output.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const FORMATS_REL = "src-runtime-base/0E1b.⚫️📀 Export Formats 📝📀.js";
const DATATAB_REL = "src-runtime-base/0Z1b.⚫️🗄️🕹️ Data Tab (Control Hub 🔌 Plugin) 🕹️.js";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readSource = (rel) => {
  const bytes = fs.readFileSync(path.join(ROOT, rel));
  return { rel, text: bytes.toString("utf8"), sha256: sha256(bytes) };
};

const formats = readSource(FORMATS_REL);
const dataTab = readSource(DATATAB_REL);

/* Parser-backed extraction: widen to each candidate closing brace and let the
 * JS engine decide which slice is a complete declaration. */
function extractFunction(source, name) {
  const needle = `function ${name}(`;
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `function ${name} not found`);
  assert.equal(source.indexOf(needle, start + 1), -1, `function ${name} declared more than once`);
  const closeRe = /\n(\s*)\}/g;
  closeRe.lastIndex = start;
  let m;
  while ((m = closeRe.exec(source)) !== null) {
    const candidate = source.slice(start, m.index + m[0].length);
    try { new vm.Script(`(${candidate})`); return candidate; } catch { /* widen */ }
  }
  throw new Error(`could not delimit ${name}`);
}

function extractAsyncFunction(source, name) {
  const needle = `async function ${name}(`;
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `async function ${name} not found`);
  const closeRe = /\n(\s*)\}/g;
  closeRe.lastIndex = start;
  let m;
  while ((m = closeRe.exec(source)) !== null) {
    const candidate = source.slice(start, m.index + m[0].length);
    try { new vm.Script(`(${candidate})`); return candidate; } catch { /* widen */ }
  }
  throw new Error(`could not delimit ${name}`);
}

/* ───────────────────────── modelled window / document ───────────────────────── */

function makeFakeWindow(opts = {}) {
  const doc = {
    _open: false,
    title: "",
    body: { innerHTML: "" },
    open() { this._open = true; this.body.innerHTML = ""; },
    write(html) {
      if (opts.writeThrows) throw new Error("simulated document.write failure");
      if (opts.writeSilentlyDrops) return;      // opens but stays empty
      this.body.innerHTML += String(html);
    },
    close() { this._open = false; },
  };
  return {
    opener: { marker: "OPENER-PRESENT" },
    document: doc,
    focus() { this.focused = true; },
    print() { this.printed = true; },
    close() { this.closed = true; },
    closed: false,
    focused: false,
    printed: false,
  };
}

function makeFormatsSandbox({ popupBlocked = false, openThrows = false, windowOpts = {} } = {}) {
  const state = { opens: 0, windows: [], timeouts: [], warns: [] };

  const W = {
    open(url, target) {
      state.opens += 1;
      if (openThrows) throw new Error("simulated window.open failure");
      if (popupBlocked) return null;
      const w = makeFakeWindow(windowOpts);
      w._openArgs = Array.from(arguments);
      state.windows.push(w);
      return w;
    },
    setTimeout(fn, ms) { state.timeouts.push({ fn, ms }); return state.timeouts.length; },
  };

  const sandbox = {
    W,
    console: { warn: (...a) => state.warns.push(a) },
    // Real converters are pulled in so the printed document is the genuine one.
    escapeHtml: undefined,
    D: { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }) },
  };

  const src = [
    extractFunction(formats.text, "escapeHtml"),
    extractFunction(formats.text, "toHTML"),
    extractFunction(formats.text, "downloadPDF"),
  ].join("\n\n");

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: FORMATS_REL });
  return { sandbox, state };
}

const SNAPSHOT = Object.freeze({
  schema: "H2O.archive.v1",
  chatId: "chat-phase0b",
  capturedAt: "2026-08-06T10:00:00.000Z",
  href: "https://chatgpt.com/c/chat-phase0b",
  messages: [
    { id: "", role: "user", text: "SENTINEL-USER-QUESTION-0B", create_time: null },
    { id: "", role: "assistant", text: "SENTINEL-ASSISTANT-ANSWER-0B", create_time: null },
  ],
});
const TITLE = "SENTINEL-ARCHIVE-TITLE-0B";

const results = [];
const record = (id, detail) => results.push({ id, ...detail });

/* ───────────────────────── P1 — successful archive PDF ───────────────────────── */
{
  const { sandbox, state } = makeFormatsSandbox();
  const res = sandbox.downloadPDF(SNAPSHOT, "H2O_archive_chat-phase0b.pdf", TITLE);

  assert.equal(res.ok, true, "P1: must report success");
  assert.equal(res.reason, "opened");
  assert.equal(state.opens, 1, "P1: exactly one window created");
  assert.equal(state.windows.length, 1);

  const w = state.windows[0];
  const html = w.document.body.innerHTML;
  assert.ok(html.length > 0, "P1: document must be populated");
  assert.ok(html.includes(TITLE), "P1: archive title present");
  assert.ok(html.includes("SENTINEL-USER-QUESTION-0B"), "P1: user text present");
  assert.ok(html.includes("SENTINEL-ASSISTANT-ANSWER-0B"), "P1: assistant text present");
  assert.ok(/<div class="msg user">/.test(html), "P1: user role identity preserved");
  assert.ok(/<div class="msg assistant">/.test(html), "P1: assistant role identity preserved");
  assert.ok(html.indexOf("SENTINEL-USER-QUESTION-0B") < html.indexOf("SENTINEL-ASSISTANT-ANSWER-0B"), "P1: message order preserved");
  assert.ok(html.includes("2026-08-06T10:00:00.000Z"), "P1: capturedAt metadata preserved");
  assert.ok(html.includes('<meta charset="utf-8">'), "P1: charset preserved");
  assert.equal(w.document.title, "H2O_archive_chat-phase0b.pdf", "P1: document title set");

  // print wiring exists but is deferred, exactly as before
  assert.equal(state.timeouts.length, 1, "P1: print is scheduled once");
  assert.equal(state.timeouts[0].ms, 250, "P1: print timing unchanged");
  assert.equal(w.printed, false, "P1: print not yet fired");
  state.timeouts[0].fn();
  assert.equal(w.printed, true, "P1: scheduled callback invokes print()");
  assert.equal(w.focused, true, "P1: scheduled callback focuses the window");
  assert.notEqual(w.closed, true, "P1: successful window stays open");
  record("P1-success-populated-print-window", { ok: res.ok, opens: state.opens, bytes: html.length });
}

/* ───────────────────────── P2 — popup blocked ───────────────────────── */
{
  const { sandbox, state } = makeFormatsSandbox({ popupBlocked: true });
  const res = sandbox.downloadPDF(SNAPSHOT, "x.pdf", TITLE);
  assert.equal(res.ok, false, "P2: must report failure");
  assert.equal(res.reason, "popup-blocked");
  assert.match(res.message, /popup/i, "P2: message explains the retry");
  assert.ok(!/exported/i.test(res.message.replace(/nothing was exported/i, "")), "P2: must not claim an export happened");
  assert.equal(state.windows.length, 0, "P2: no usable window");
  record("P2-popup-blocked", { ok: res.ok, reason: res.reason });
}

/* ───────────────────────── P3 — document write failure ───────────────────────── */
{
  const { sandbox, state } = makeFormatsSandbox({ windowOpts: { writeThrows: true } });
  const res = sandbox.downloadPDF(SNAPSHOT, "x.pdf", TITLE);
  assert.equal(res.ok, false, "P3: must report failure");
  assert.equal(res.reason, "write-failed");
  assert.match(res.message, /simulated document.write failure/, "P3: diagnostics preserved in message");
  assert.equal(state.warns.length, 1, "P3: diagnostic logged");
  assert.equal(state.windows[0].closed, true, "P3: failed window is closed, not left blank");
  assert.equal(state.timeouts.length, 0, "P3: no print scheduled on failure");
  record("P3-write-failure", { ok: res.ok, reason: res.reason, windowClosed: true });
}

/* P3b — window opens but stays empty (blank tab) must be caught and closed */
{
  const { sandbox, state } = makeFormatsSandbox({ windowOpts: { writeSilentlyDrops: true } });
  const res = sandbox.downloadPDF(SNAPSHOT, "x.pdf", TITLE);
  assert.equal(res.ok, false, "P3b: an empty document must not be success");
  assert.equal(res.reason, "document-empty");
  assert.equal(state.windows[0].closed, true, "P3b: the blank tab is closed");
  assert.equal(state.timeouts.length, 0, "P3b: no print scheduled");
  record("P3b-blank-tab-detected-and-closed", { ok: res.ok, reason: res.reason });
}

/* ───────────────────────── P4 — empty / malformed snapshot ───────────────────────── */
for (const [label, snap, expectReason] of [
  ["no messages array", { chatId: "c", messages: null }, "empty-snapshot"],
  ["empty messages", { chatId: "c", messages: [] }, "empty-snapshot"],
  ["null snapshot", null, "empty-snapshot"],
  ["undefined snapshot", undefined, "empty-snapshot"],
]) {
  const { sandbox, state } = makeFormatsSandbox();
  const res = sandbox.downloadPDF(snap, "x.pdf", TITLE);
  assert.equal(res.ok, false, `P4 (${label}): must fail explicitly`);
  assert.equal(res.reason, expectReason, `P4 (${label}): explicit reason`);
  assert.equal(state.opens, 0, `P4 (${label}): NO window may be opened — no blank tab`);
}
record("P4-empty-or-malformed-snapshot", { cases: 4, windowsOpened: 0 });

/* P4b — window.open itself throwing is a truthful failure, not a crash */
{
  const { sandbox } = makeFormatsSandbox({ openThrows: true });
  const res = sandbox.downloadPDF(SNAPSHOT, "x.pdf", TITLE);
  assert.equal(res.ok, false, "P4b: throw becomes explicit failure");
  assert.equal(res.reason, "popup-blocked");
  record("P4b-window-open-throws", { ok: res.ok, reason: res.reason });
}

/* ───────────────────────── P5 — Data Tab result contract ───────────────────────── */

const dispatchSrc = extractAsyncFunction(dataTab.text, "DATA_exportLatestArchive2");

function makeDataTabSandbox(downloadPDFImpl) {
  const state = { warns: [], fallthrough: 0 };
  const sandbox = {
    console: { warn: (...a) => state.warns.push(a) },
    DATA_getArchiveBootApi: () => ({}),
    DATA_archiveModuleMissingMessage: () => "Archive module missing.",
    DATA_pickLatestArchiveSnapshot: async () => ({ snapshot: SNAPSHOT, chatId: "chat-phase0b" }),
    DATA_exportLatestArchive: async () => { state.fallthrough += 1; return { ok: true, message: "non-pdf route" }; },
    H2O: { export: { downloadPDF: downloadPDFImpl } },
  };
  vm.createContext(sandbox);
  vm.runInContext(dispatchSrc, sandbox, { filename: DATATAB_REL });
  return { sandbox, state };
}

const SUCCESS_RE = /^(ok|exported|opened)/i;

// P5a — real success propagates as success
{
  const { sandbox } = makeDataTabSandbox(() => ({ ok: true, reason: "opened", message: "Print window opened." }));
  const out = await sandbox.DATA_exportLatestArchive2("pdf");
  assert.equal(out.ok, true, "P5a: Data Tab reports success when downloadPDF confirms it");
  assert.ok(!/exported .* to pdf/i.test(out.message), "P5a: must not claim a PDF file was exported");
  record("P5a-success-propagates", { ok: out.ok });
}

// P5b — every non-success return shape must become a Data Tab failure
for (const [label, impl] of [
  ["legacy false", () => false],
  ["null", () => null],
  ["undefined", () => undefined],
  ["ok:false", () => ({ ok: false, reason: "popup-blocked", message: "Could not open the print window." })],
  ["truthy object without ok", () => ({ reason: "weird" })],
  ["ok:'true' string", () => ({ ok: "true" })],
  ["throws", () => { throw new Error("boom"); }],
]) {
  const { sandbox } = makeDataTabSandbox(impl);
  const out = await sandbox.DATA_exportLatestArchive2("pdf");
  assert.notEqual(out.ok, true, `P5b (${label}): must NOT be success`);
  assert.ok(out.message && out.message.length > 0, `P5b (${label}): must carry a failure message`);
  assert.ok(!SUCCESS_RE.test(out.message), `P5b (${label}): failure message must not read as success — got "${out.message}"`);
}
record("P5b-non-success-shapes-rejected", { shapes: 7 });

// P5c — a rejected promise must not become success
{
  const { sandbox } = makeDataTabSandbox(() => Promise.reject(new Error("async boom")));
  const out = await sandbox.DATA_exportLatestArchive2("pdf");
  assert.notEqual(out.ok, true, "P5c: a rejected promise must not be success");
  record("P5c-rejected-promise-rejected", { ok: out.ok === true });
}

// P5d — missing exporter method still fails cleanly
{
  const { sandbox } = makeDataTabSandbox(undefined);
  const out = await sandbox.DATA_exportLatestArchive2("pdf");
  assert.notEqual(out.ok, true, "P5d: absent downloadPDF must fail");
  assert.match(out.message, /unavailable/i);
  record("P5d-exporter-unavailable", { ok: out.ok === true });
}

/* ───────────────────────── P6 — non-PDF routes unchanged ───────────────────────── */
{
  // Structural: the other downloaders still delegate to downloadText with their
  // original MIME types and return no structured result.
  for (const [fn, mime] of [
    ["downloadMarkdown", "text/markdown;charset=utf-8"],
    ["downloadHTML", "text/html;charset=utf-8"],
    ["downloadJSON", "application/json;charset=utf-8"],
  ]) {
    const body = extractFunction(formats.text, fn);
    assert.ok(body.includes("downloadText("), `P6: ${fn} still uses downloadText`);
    assert.ok(body.includes(mime), `P6: ${fn} MIME unchanged`);
    assert.ok(!body.includes("ok:"), `P6: ${fn} must not gain a structured result`);
  }
  for (const fn of ["downloadDOC", "downloadDOCXReal"]) {
    const body = extractFunction(formats.text, fn);
    assert.ok(!/\breason:\s*'/.test(body), `P6: ${fn} unchanged by Phase 0B`);
  }
  // Data Tab archive mapping untouched
  assert.match(dataTab.text, /json:\s*\{\s*method:'downloadJSON',\s*ext:'json',\s*label:'JSON'\s*\}/, "P6: JSON mapping unchanged");
  assert.match(dataTab.text, /markdown:\s*\{\s*method:'downloadMarkdown',\s*ext:'md',\s*label:'Markdown'\s*\}/, "P6: Markdown mapping unchanged");
  assert.match(dataTab.text, /html:\s*\{\s*method:'downloadHTML',\s*ext:'html',\s*label:'HTML'\s*\}/, "P6: HTML mapping unchanged");
  // docx / doc branches still present and structurally intact
  assert.match(dispatchSrc, /if \(kind === 'docx'\)/, "P6: docx branch intact");
  assert.match(dispatchSrc, /if \(kind === 'doc'\)/, "P6: doc branch intact");
  assert.match(dispatchSrc, /return DATA_exportLatestArchive\(kind\);/, "P6: non-pdf fallthrough intact");
  record("P6-non-pdf-routes-unchanged", { checked: 5 });
}

/* ───────────────────────── P7 — security invariant ───────────────────────── */
{
  const body = extractFunction(formats.text, "downloadPDF");
  assert.ok(!/W\.open\([^)]*noopener/.test(body), "P7: the handle-dependent noopener call must be gone");
  assert.ok(!/noreferrer/.test(body.replace(/^\s*\*.*$/gm, "")), "P7: no noreferrer in executable code");
  assert.match(body, /w\.opener\s*=\s*null/, "P7: opener must be severed");
  const openAt = body.indexOf("W.open(");
  const severAt = body.search(/w\.opener\s*=\s*null/);
  const writeAt = body.indexOf("document.write");
  assert.ok(openAt >= 0 && severAt > openAt, "P7: opener severed after open");
  assert.ok(severAt < writeAt, "P7: opener severed BEFORE any content is written");
  record("P7-opener-safety", { strategy: "same-origin about:blank + opener severed before write" });
}

/* ───────────────────────── P8 — side-effect counts ───────────────────────── */
{
  const ok = makeFormatsSandbox();
  ok.sandbox.downloadPDF(SNAPSHOT, "x.pdf", TITLE);
  assert.equal(ok.state.opens, 1, "P8: success opens exactly one window");

  let failureOpens = 0, failureSuccesses = 0;
  for (const opts of [{ popupBlocked: true }, { windowOpts: { writeThrows: true } }, { windowOpts: { writeSilentlyDrops: true } }]) {
    const f = makeFormatsSandbox(opts);
    const r = f.sandbox.downloadPDF(SNAPSHOT, "x.pdf", TITLE);
    if (r.ok === true) failureSuccesses += 1;
    if (f.state.windows.length && !f.state.windows[0].closed) failureOpens += 1;
  }
  assert.equal(failureSuccesses, 0, "P8: no failure path reports success");
  assert.equal(failureOpens, 0, "P8: no failure path leaves a window open");
  record("P8-side-effect-counts", { successWindows: 1, leakedWindows: 0, falseSuccesses: 0 });
}

/* ───────────────────────── P9 — validator hygiene ───────────────────────── */
{
  // Capability check rather than a string scan: prove the validator has no way
  // to write files, spawn processes, or reach the network. Comments are
  // stripped first so prose about the runtime lane cannot trip this.
  const self = fs
    .readFileSync(fileURLToPath(import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  // The import surface is the capability boundary: an ESM validator cannot
  // spawn a process or reach the network without importing something for it.
  const ALLOWED_MODULES = new Set([
    "node:assert/strict", "node:crypto", "node:fs", "node:path", "node:vm", "node:url",
  ]);
  const imported = Array.from(self.matchAll(/^import\s+[^;]*?from\s+"([^"]+)";/gm), (m) => m[1]);
  assert.ok(imported.length > 0, "P9: import scan found nothing — check the matcher");
  for (const mod of imported) {
    assert.ok(ALLOWED_MODULES.has(mod), `P9: unexpected import "${mod}" — capability boundary widened`);
  }
  // fs is imported for reading only; assert no mutating fs call is present.
  const mutatingFs = self.match(/fs\.[a-zA-Z]*(?:write|append|copy|rm|unlink|mkdir|rename)[a-zA-Z]*\s*\(/g) || [];
  assert.equal(mutatingFs.length, 0, "P9: validator must not write to the filesystem");
  record("P9-no-runtime-delivery-interaction", {
    imports: imported, fileWrites: false, subprocess: false, network: false,
  });
}

console.log(JSON.stringify({
  ok: true,
  validator: "export-phase0b-archive-pdf",
  scenarios: results.length,
  results,
  attestation: { [FORMATS_REL]: formats.sha256, [DATATAB_REL]: dataTab.sha256 },
  proofClass: {
    scopeB0_archive_pdf: "behavioural — real downloadPDF and real DATA_exportLatestArchive2 "
      + "executed from shipped source bytes against a modelled window/document",
    notCovered: "live Export Chat PDF (0E1a), DOCX defects, Markdown/whitespace fidelity",
  },
}, null, 2));
