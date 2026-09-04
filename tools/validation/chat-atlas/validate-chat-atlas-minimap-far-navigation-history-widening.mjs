// @version 1.0.0
//
// L-EXTENSION-INTERNAL-CHAT far-navigation contract: MiniMap reaches a distant native
// turn by repeating ChatGPT's own history reveal while a navigation-scoped
// fetch hook widens only `num_turns` on the host's next matching request.
//
// These fixtures pin the invariants that keep that safe:
//   - the hook is inactive by default and rewrites at most one request per arm;
//   - only this conversation's history endpoint can match, GET only;
//   - the host's `before` cursor and every other parameter stay untouched —
//     `num_turns` is the single mutation;
//   - ownership is re-verified at rewrite time (route + navigation generation);
//   - cycles continue only while the materialised edge measurably advances and
//     fail accurately otherwise (no-progress, ceiling);
//   - the near-target hop walk and its 5s budget remain unchanged — the far
//     driver extends only its own operation's deadline;
//   - progress is visible and user-cancellable through the existing
//     coordinator cancel authority.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const SOURCE_REL = "src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js";
const source = fs.readFileSync(path.join(REPO_ROOT, SOURCE_REL), "utf8");

function extractFunction(name, { async: isAsync = false } = {}) {
  const prefix = `  ${isAsync ? "async " : ""}function ${name}(`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`function-anchor-missing:${name}`);
  if (source.indexOf(prefix, start + 1) >= 0) throw new Error(`function-anchor-ambiguous:${name}`);
  let depth = 0;
  let seenBody = false;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    // Comments may contain apostrophes and braces; they must not steer the scan.
    if (ch === "/" && source[index + 1] === "/") {
      const nl = source.indexOf("\n", index);
      index = nl < 0 ? source.length : nl;
      continue;
    }
    if (ch === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") { depth += 1; seenBody = true; continue; }
    if (ch === "}") {
      depth -= 1;
      if (seenBody && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

const matches = extractFunction("MINI_historyWidenMatches");
const hook = extractFunction("MINI_ensureHistoryWidenHook");
const arm = extractFunction("MINI_armHistoryWidening");
const driver = extractFunction("MINI_materializeFarTarget", { async: true });

const fixtures = [];
const record = (name, fn) => fixtures.push({ name, fn });

// 1 — inactive by default; only the arm path can activate it.
record("hook-inactive-by-default", () => {
  assert.match(source, /const historyWiden = \{\n    armed: false,/, "historyWiden must initialise disarmed");
  const activations = source.split("historyWiden.armed = true").length - 1;
  assert.equal(activations, 1, "exactly one activation site");
  assert.ok(arm.includes("historyWiden.armed = true"), "activation must live in MINI_armHistoryWidening");
});

// 2 — endpoint scope: this conversation's history endpoint, both cursor params
// present, same origin, GET only.
record("match-scope-is-exact", () => {
  assert.ok(matches.includes("`/backend-api/conversations/${historyWiden.chatId}/messages`"),
    "pathname must be pinned to the armed conversation's history endpoint");
  assert.ok(matches.includes("parsed.origin !== location.origin"), "cross-origin must never match");
  assert.match(matches, /searchParams\.get\('before'\)/, "host cursor must be required");
  assert.match(matches, /searchParams\.get\('num_turns'\)/, "num_turns must be required");
  assert.ok(hook.includes("if (method === 'GET')"), "only GET requests may be considered");
});

// 3 — `num_turns` is the single mutation; `before` and everything else pass
// through untouched.
record("only-num-turns-is-rewritten", () => {
  const sets = matches.match(/searchParams\.set\(/g) || [];
  assert.equal(sets.length, 1, "exactly one query mutation");
  assert.match(matches, /searchParams\.set\('num_turns'/, "and it must be num_turns");
  assert.doesNotMatch(matches, /searchParams\.set\('before'/, "the host cursor must never be rewritten");
  assert.doesNotMatch(matches, /searchParams\.delete\(/, "no parameter may be removed");
});

// 4 — one-shot: a successful rewrite disarms before the request is re-issued.
record("rewrite-disarms-immediately", () => {
  const idx = hook.indexOf("MINI_disarmHistoryWidening('rewritten')");
  const reissue = hook.indexOf("original.call(this, next, init)");
  assert.ok(idx > 0 && reissue > idx, "disarm must precede the re-issued request");
});

// 5 — ownership is re-verified at rewrite time, not just at arm time.
record("rewrite-time-route-and-generation-guard", () => {
  assert.ok(matches.includes("historyWiden.routeKey !== MINI_completeIndexRouteKey()"),
    "route must be re-checked when the request appears");
  assert.ok(matches.includes("Number(status.generation) !== Number(historyWiden.generation)"),
    "a superseding navigation generation must invalidate the widening");
});

// 6 — an armed widening cannot outlive its cycle.
record("arm-carries-bounded-expiry", () => {
  assert.match(arm, /setTimeout\(\s*\(\) => MINI_disarmHistoryWidening\('expired'\)/,
    "arming must schedule its own expiry disarm");
});

// 7 — the widened page size is bounded and never a membership input.
record("widen-amount-bounded", () => {
  assert.match(arm, /Math\.min\(HISTORY_WIDEN_MAX, gap \+ 5\)/, "page size derives from the gap, bounded");
  assert.match(source, /const HISTORY_WIDEN_MAX = 50;/, "bound must match the empirically honored range");
});

// 8 — progress-driven continuation: rearm per backward cycle, stop accurately
// when the edge stops advancing or the ceiling is reached.
record("driver-progress-contract", () => {
  assert.ok(driver.includes("if (mode === 'older') MINI_armHistoryWidening(generation"),
    "each older-history cycle rearms explicitly and only that direction widens");
  assert.ok(driver.includes("errorCode: 'no-progress'"), "stalled materialisation must fail accurately");
  assert.ok(driver.includes("errorCode: 'materialization-ceiling'"), "the cycle ceiling must fail accurately");
  assert.ok(driver.includes("if (ctl.isStale()) return result({ errorCode: 'cancelled' })"),
    "staleness must terminate between steps");
  assert.match(driver, /if \(!startOrders\.length\) return null;/,
    "with no bound evidence the unchanged hop walk keeps ownership");
  assert.ok(driver.includes("if (stallCycles >= 3) {"),
    "three consecutive stalled cycles reach the stall boundary");
  assert.ok(driver.includes("|| { errorCode: 'no-progress' }"),
    "the stall boundary still reports no-progress when the grace re-check finds nothing");
  assert.ok(driver.includes("if (gapNow < lastGap || requestedThisCycle || movedEnough) stallCycles = 0;"),
    "gap improvement, a host request, or real displacement resets the stall counter");
});

// 9 — duration policy: the far driver extends only its own operation, and the
// coordinator's stale check honors that extension while the near-target
// limits stay literal.
record("deadline-extension-is-operation-scoped", () => {
  assert.ok(driver.includes("ctl.extendDeadline(Math.min(120000, (maxCycles * FAR_NAV_CYCLE_BUDGET_MS) + 15000))"),
    "watchdog must derive from the measured per-cycle cost");
  assert.ok(source.includes("const aligner = typeof adapters?.alignFar === 'function'"),
    "far completions must use the top-alignment adapter");
  assert.match(source, /Number\(operation\.deadlineMs \|\| 0\)/, "staleReason must honor the per-operation deadline");
  assert.match(source, /totalDurationMs: 5000/, "the near-target budget literal must remain unchanged");
  assert.match(source, /maxHops: 5/, "the hop budget literal must remain unchanged");
});

// 10 — visible, cancellable progress through the existing cancel authority.
record("progress-ui-cancels-via-coordinator", () => {
  const statusEl = extractFunction("MINI_farNavStatusEl");
  assert.ok(statusEl.includes("completeIndexNavigationCoordinator.cancel('user-cancelled')"),
    "the status pill must cancel through the existing coordinator");
  assert.ok(driver.includes("MINI_clearFarNavProgress(generation)"), "the pill must clear when the driver exits");
});

// 11 — unrelated traffic passes through the original fetch untouched.
record("unrelated-requests-untouched", () => {
  assert.ok(hook.includes("return original.apply(this, arguments)"),
    "non-matching calls must reach the original fetch with original arguments");
  assert.ok(hook.includes("__h2oOriginalFetch"), "the original fetch must remain reachable");
});

// 12 — logical membership stays Chat Atlas's: the far path never writes turn
// records, and the engine still has no membership writer.
record("membership-authority-untouched", () => {
  for (const banned of ["commitTurnDrafts", "turnState.turns ="]) {
    assert.ok(!source.includes(banned), `${banned} must not appear in the MiniMap engine`);
  }
  assert.doesNotMatch(driver, /listTurnRecords\s*=/, "the driver must not replace membership surfaces");
});

let passed = 0;
const failures = [];
for (const fixture of fixtures) {
  try {
    fixture.fn();
    passed += 1;
  } catch (error) {
    failures.push({ name: fixture.name, error: String(error?.message || error) });
    process.stderr.write(`FAIL ${fixture.name}: ${error?.message || error}\n`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: failures.length === 0,
  productionSourcePath: SOURCE_REL,
  fixtureCount: fixtures.length,
  passed,
  failures: failures.length,
  results: failures,
})}\n`);
process.exit(failures.length === 0 ? 0 : 1);
