#!/usr/bin/env node
/* Backend authority enforcement — architectural drift detector.
 *
 * Authenticated ChatGPT backend traffic must converge on 0A4a. Independent
 * transports are what produced the rate-limit storm this architecture exists
 * to prevent, and a new one would reintroduce it while looking like ordinary
 * code. This validator makes that regression fail loudly.
 *
 * HONEST LIMIT — read this before trusting it. Static analysis cannot prove
 * the absence of every dynamic request. A path assembled from character codes,
 * fetched from configuration, or reached through an aliased function
 * reference will not be detected. This is a drift detector for accidental
 * architectural bypass, NOT a security sandbox. It raises the cost of leaving
 * the architecture by accident; it does not make leaving it impossible.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCAN_DIRS = ["src-runtime-base", "shared"];

const AUTHORITY_FILE = "0A4a.⬛️🌐 Backend Request Authority 🌐.js";
const ACCEPTANCE_ADAPTER_FILE = "0A4b.⬛️🌐 Backend Acceptance Adapter 🌐.js";

/* Every file permitted to mention an authenticated backend endpoint, with the
   reason. Anything else naming one is a drift failure. */
const ALLOWED = new Map([
  [AUTHORITY_FILE, {
    role: "authority",
    why: "owns authenticated backend transport",
  }],
  [ACCEPTANCE_ADAPTER_FILE, {
    role: "acceptance-adapter",
    why: "named feature adapter; explicitly forbidden from owning transport",
  }],
  ["0F2a.⬛️🗂️ Projects 🗂️.js", {
    role: "observational",
    why: "wraps W.fetch to observe ChatGPT's own sidebar request; produces none",
  }],
]);

const AUTH_SESSION = "/api/auth/session";
const BACKEND_PREFIX = "/backend-api/";

function walk(dir) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/* Comments and the module header carry prose about endpoints; only code
   should be judged. This small lexical pass preserves quoted/template text
   while blanking comments. Regex replacement is unsafe here: the module
   header contains `https://chatgpt.com/*`, whose trailing `/*` previously
   consumed source until an unrelated later block-comment terminator and made
   the scanner blind to real fetch sites. */
function stripComments(src) {
  const text = String(src || "");
  let out = "";
  let mode = "code";
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1] || "";

    if (mode === "line-comment") {
      if (ch === "\n" || ch === "\r") {
        out += ch;
        mode = "code";
      } else {
        out += " ";
      }
      continue;
    }

    if (mode === "block-comment") {
      if (ch === "*" && next === "/") {
        out += "  ";
        i += 1;
        mode = "code";
      } else {
        out += ch === "\n" || ch === "\r" ? ch : " ";
      }
      continue;
    }

    if (mode !== "code") {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (
        (mode === "single-quote" && ch === "'")
        || (mode === "double-quote" && ch === '"')
        || (mode === "template" && ch === "`")
      ) {
        mode = "code";
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      out += "  ";
      i += 1;
      mode = "line-comment";
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 1;
      mode = "block-comment";
      continue;
    }
    if (ch === "'") mode = "single-quote";
    else if (ch === '"') mode = "double-quote";
    else if (ch === "`") mode = "template";
    out += ch;
  }

  return out;
}

/* Regression proof for the exact blind spot plus a synthetic authenticated
   backend mutation. These run before the repository census so a future
   scanner regression cannot make the main validation pass vacuously. */
{
  const blindSpotFixture = [
    "// @match https://chatgpt.com/*",
    "const sessionPath = '/api/auth/session';",
    "const conversationPath = `/backend-api/conversation/${chatId}`;",
    "/* /backend-api/comment-only */",
    "W.fetch(conversationPath); // fetch('/backend-api/comment-only')",
  ].join("\n");
  const code = stripComments(blindSpotFixture);
  assert.ok(code.includes(AUTH_SESSION), "comment stripping must preserve the session endpoint after a URL module header");
  assert.ok(code.includes(BACKEND_PREFIX), "comment stripping must preserve backend endpoint literals in code");
  assert.strictEqual((code.match(/\b(?:W\.)?fetch\s*\(/g) || []).length, 1,
    "comment stripping must preserve the real fetch while removing comment-only fetch text");
}

const files = SCAN_DIRS.flatMap(walk);
assert.ok(files.length > 50, `scan found only ${files.length} files; the tree layout probably changed`);

const findings = [];
const census = [];
const records = [];

for (const rel of files) {
  const base = path.basename(rel);
  const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const code = stripComments(raw);
  const allow = ALLOWED.get(base);

  const mentionsSession = code.includes(AUTH_SESSION);
  const mentionsBackend = code.includes(BACKEND_PREFIX);
  const fetchSites = (code.match(/\b(?:W\.)?fetch\s*\(/g) || []).length;
  const record = { rel, base, fetchSites, mentionsSession, mentionsBackend, role: allow?.role || "none" };
  records.push(record);

  if (fetchSites > 0) census.push(record);

  if (mentionsSession && allow?.role !== "authority" && allow?.role !== "pending-migration") {
    findings.push(`${rel}: references ${AUTH_SESSION} — session acquisition belongs to the authority`
      + (allow ? ` (declared role: ${allow.role})` : ""));
  }
  if (mentionsBackend && !allow) {
    findings.push(`${rel}: references ${BACKEND_PREFIX} without an allow-list entry`);
  }
}

/* The declared exception must actually still be needed: once 0D3a migrates,
   this entry has to go, and a stale allowance is itself drift. */
const archive = records.find((c) => c.base.startsWith("0D3a"));
if (ALLOWED.get(archive?.base)?.role === "pending-migration" && !archive?.mentionsBackend && !archive?.mentionsSession) {
  findings.push("0D3a no longer touches the backend — remove its pending-migration exception");
}

/* Deliberately reintroduce the forbidden shape in memory and prove that it is
   visible and would fail without a pending-migration allowance. */
{
  const mutation = "async function rawArchiveRead() { return W.fetch('/backend-api/conversation/mutation', { headers: { authorization: 'Bearer mutation' } }); }";
  const code = stripComments(mutation);
  const mutationFetches = (code.match(/\b(?:W\.)?fetch\s*\(/g) || []).length;
  assert.strictEqual(mutationFetches, 1, "mutation proof must expose the injected raw backend fetch");
  assert.ok(code.includes(BACKEND_PREFIX), "mutation proof must expose the injected backend endpoint");
  assert.ok(!ALLOWED.has("0D3a.mutation.js"), "mutation proof must not inherit the real Archive allowance");
}

/* 0F2a is allowed to wrap fetch, but only to observe. If it ever constructs a
   backend request of its own, the observational allowance no longer holds. */
{
  const rel = files.find((f) => path.basename(f).startsWith("0F2a"));
  if (rel) {
    const code = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    assert.ok(code.includes("originalFetch.apply"),
      "0F2a must delegate to the original fetch; its allowance is observational only");
    assert.ok(!/\bfetch\s*\(\s*[`'"]\/backend-api\//.test(code),
      "0F2a must not construct a backend request of its own");
  }
}

/* Dynamic construction: a fragment assigned to a variable and concatenated
   still leaves the literal behind, which the mention check above catches.
   This asserts that assumption holds for the pattern we can see. */
for (const rel of files) {
  const base = path.basename(rel);
  if (ALLOWED.has(base)) continue;
  const code = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  if (/['"`]\/backend-api['"`]|['"`]\/backend-api\/['"`]/.test(code)) {
    findings.push(`${rel}: builds a backend path from a fragment without an allow-list entry`);
  }
}

/* The authority itself must remain the only producer inside its own file, and
   must keep its fail-closed and origin guards. */
{
  const code = fs.readFileSync(path.join(ROOT, "src-runtime-base", AUTHORITY_FILE), "utf8");
  assert.ok(code.includes("const SUPPORTED_ORIGIN = 'https://chatgpt.com'"), "authority must pin the supported origin");
  assert.ok(code.includes("h2o.backend-authority.chatgpt.v1"), "authority must use the approved lock name");
  assert.ok(code.includes("navigator?.locks"), "authority must require Web Locks");
  assert.ok(!/localStorage\.setItem\([^)]*(accessToken|Bearer)/i.test(code), "the access token must never be persisted");
  const fetches = (stripComments(code).match(/\bW\.fetch\s*\(/g) || []).length;
  assert.strictEqual(fetches, 2, `authority should hold exactly 2 fetch sites (session + request), found ${fetches}`);
}

/* Title must not have kept a private transport. */
{
  const rel = files.find((f) => path.basename(f).startsWith("9B0a"));
  const code = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  const fetches = (code.match(/\b(?:W\.)?fetch\s*\(/g) || []).length;
  assert.strictEqual(fetches, 0, `9B0a must issue no requests of its own, found ${fetches}`);
  assert.ok(code.includes("H2O.BackendAuthority"), "9B0a must consume the authority");
  assert.ok(code.includes("authority-unavailable"), "9B0a must fail closed when the authority is absent");
}

/* The acceptance adapter is a named feature facade, never a second authority. */
{
  const file = path.join(ROOT, "src-runtime-base", ACCEPTANCE_ADAPTER_FILE);
  assert.ok(fs.existsSync(file), "0A4b acceptance adapter must exist");
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const fetches = (code.match(/\b(?:W\.)?fetch\s*\(/g) || []).length;
  assert.strictEqual(fetches, 0, `0A4b must contain zero fetch sites, found ${fetches}`);
  assert.ok(!code.includes(AUTH_SESSION), "0A4b must not name the session endpoint");
  assert.ok(!code.includes(BACKEND_PREFIX), "0A4b must not name a backend endpoint");
  assert.ok(!/\bBearer\s|Authorization\s*:|accessToken/.test(code), "0A4b must not construct authentication material");
  assert.ok(!/BackendAuthority\s*\.\s*request\s*\(/.test(code), "0A4b must not call authority transport directly");
  assert.ok(code.includes("H2O.ChatTitle"), "0A4b title acceptance must use the Title feature API");
  assert.ok(code.includes("fetchConversationTurnIndex"), "0A4b archive acceptance must use the Archive feature API");
}

/* Generated aliases are delivery copies; an edit there would bypass every
   check above, so where they exist they must match their source. */
const aliasDir = path.join(ROOT, "apps/dev-server/alias");
let aliasChecked = 0;
if (fs.existsSync(aliasDir)) {
  for (const rel of files) {
    const base = path.basename(rel);
    if (!ALLOWED.has(base) && !base.startsWith("9B0a")) continue;
    const aliasName = base.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "_").replace(/^_+|_+$/g, "");
    const candidate = fs.readdirSync(aliasDir).find((f) => f.startsWith(aliasName.slice(0, 4)));
    if (!candidate) continue;
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const alias = fs.readFileSync(path.join(aliasDir, candidate), "utf8");
    assert.strictEqual(alias.trim(), source.trim(), `generated alias ${candidate} has drifted from ${rel}`);
    aliasChecked += 1;
  }
}

/* Acceptance-tooling rule, encoded rather than left to convention: ad-hoc
   page-evaluated authenticated fetch loops are not an approved acceptance
   path. Any future live acceptance helper must consume the authority. */
{
  const toolDirs = ["tools/validation", "tools/dev", "tools/smoke"].map((d) => path.join(ROOT, d)).filter((d) => fs.existsSync(d));
  const offenders = [];
  for (const dir of toolDirs) {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const abs = path.join(cur, e.name);
        if (e.isDirectory()) { stack.push(abs); continue; }
        if (!/\.(mjs|js)$/.test(e.name)) continue;
        // This file states the rule, so it necessarily contains the patterns
        // the rule matches on; scanning itself would always self-report.
        if (abs === fileURLToPath(import.meta.url)
            || e.name === "validate-backend-acceptance-runner.mjs") continue;
        const code = stripComments(fs.readFileSync(abs, "utf8"));
        /* A tool that both drives a live page AND names a backend endpoint is
           the ad-hoc acceptance pattern this rule forbids. */
        const drivesPage = /Runtime\.evaluate|page\.evaluate|javascript_tool/.test(code);
        if (drivesPage && (code.includes(BACKEND_PREFIX) || code.includes(AUTH_SESSION))) {
          offenders.push(path.relative(ROOT, abs));
        }
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    `ad-hoc page-evaluated authenticated backend access is not an approved acceptance path: ${offenders.join(", ")}`);

  const runnerFile = path.join(ROOT, "tools/smoke/backend-acceptance-runner.mjs");
  assert.ok(fs.existsSync(runnerFile), "governed acceptance runner must exist");
  const runnerCode = stripComments(fs.readFileSync(runnerFile, "utf8"));
  for (const flag of ["--evaluate", "--expression", "--script", "--javascript"]) {
    assert.ok(!runnerCode.includes(flag), `acceptance runner must not expose arbitrary page code through ${flag}`);
  }
  assert.ok(runnerCode.includes("op-not-allowlisted"), "acceptance runner must default-deny unknown operations");
}

if (findings.length) {
  console.error("FAIL validate-backend-authority-enforcement");
  for (const f of findings) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("PASS validate-backend-authority-enforcement");
console.log(`  fetch call-site census: ${census.length} file(s) in ${SCAN_DIRS.join(", ")}`);
for (const c of census) {
  const tag = c.role === "none" ? "unrelated" : c.role;
  console.log(`    ${c.base.slice(0, 46).padEnd(48)} fetch×${String(c.fetchSites).padEnd(2)} [${tag}]`);
}
console.log(`  generated aliases compared: ${aliasChecked}`);
console.log("  scanner regression + raw-backend mutation proofs: PASS");
console.log("  NOTE: static analysis cannot prove the absence of every dynamic request;");
console.log("        this detects accidental architectural drift, not deliberate evasion.");
