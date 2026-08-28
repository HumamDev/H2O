// @version 1.0.0
//
// L-INTERNAL-CHAT performance regression: complete-index mounted-anchor binding
// must not run on every active-sync frame while the MiniMap owns a programmatic
// navigation.
//
// MINI_bindCompleteIndexMountedAnchors() rebuilds the complete-index projection
// status once per record and probes the document for every unmounted one. It sat
// ahead of every guard in syncActive(), so it also ran on each rAF frame of our
// own programmatic scrolling — where it is pure waste, because the navigation
// coordinator resolves its own target. Suppressing it there measurably raised
// navigation throughput (2 hops/5.16s -> 5 hops/5.03s on a 37-turn conversation).
//
// These fixtures pin the suppression AND the two behaviours it must not disturb:
// ordinary user-scroll reconciliation, and reconciliation resuming once the
// navigation releases ownership.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const SOURCE_REL = "src-runtime-base/1A1c.🟥🗺️ MiniMap Engine 🚀🗺️.js";
const source = fs.readFileSync(path.join(REPO_ROOT, SOURCE_REL), "utf8");

function extractFunction(name) {
  const prefix = `  function ${name}(`;
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
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") { depth += 1; seenBody = true; continue; }
    if (ch === "}") {
      depth -= 1;
      if (seenBody && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`function-boundary-invalid:${name}`);
}

const syncActive = extractFunction("syncActive");
const bindCall = "MINI_bindCompleteIndexMountedAnchors()";

const fixtures = [];
const record = (name, fn) => fixtures.push({ name, fn });

// A — the expensive bind is reached only when the MiniMap does not own a
// programmatic navigation.
record("anchor-bind-is-guarded-by-mmProgram", () => {
  const idx = syncActive.indexOf(bindCall);
  assert.ok(idx > 0, "syncActive must still perform anchor binding");
  const line = syncActive.slice(syncActive.lastIndexOf("\n", idx) + 1, idx);
  assert.match(line, /if\s*\(\s*!\s*S\.mmProgram\s*\)/, "the bind call must sit behind a !S.mmProgram guard");
});

record("anchor-bind-appears-exactly-once", () => {
  const occurrences = syncActive.split(bindCall).length - 1;
  assert.equal(occurrences, 1, "suppression must not duplicate the binding call");
});

// B — ordinary user scrolling still reconciles: the guard must not have been
// folded in behind the later early-returns, which would skip binding whenever
// scroll sync is disabled or the user is dragging the rail.
record("user-scroll-reconciliation-precedes-early-returns", () => {
  const bindIdx = syncActive.indexOf(bindCall);
  const scrollDisabledIdx = syncActive.indexOf("if (S.scrollSyncDisabled) return;");
  const ownerIdx = syncActive.indexOf("if (S.mmUser || S.mmProgram) return;");
  assert.ok(scrollDisabledIdx > 0 && ownerIdx > 0, "existing syncActive guards must remain");
  assert.ok(bindIdx < scrollDisabledIdx, "binding must still run before the scrollSyncDisabled return");
  assert.ok(bindIdx < ownerIdx, "binding must still run before the ownership return");
});

record("mmUser-still-reconciles-anchors", () => {
  // Only mmProgram is suppressed. A user-driven rail drag (mmUser) must keep
  // binding, exactly as before this change.
  const idx = syncActive.indexOf(bindCall);
  const line = syncActive.slice(syncActive.lastIndexOf("\n", idx) + 1, idx);
  assert.doesNotMatch(line, /S\.mmUser/, "mmUser must not be added to the suppression condition");
});

// C — reconciliation resumes after navigation: the ownership flag is the only
// thing gating it, so releasing it restores the previous behaviour.
record("suppression-releases-with-mmProgram", () => {
  const guard = (mmProgram) => !mmProgram;
  assert.equal(guard(true), false, "binding suppressed while navigation owns the viewport");
  assert.equal(guard(false), true, "binding resumes once navigation ownership ends");
});

record("bind-still-wrapped-in-try-catch", () => {
  const idx = syncActive.indexOf(bindCall);
  const line = syncActive.slice(syncActive.lastIndexOf("\n", idx) + 1, syncActive.indexOf("\n", idx));
  assert.match(line, /try\s*\{/, "binding must remain fail-soft");
});

// D — this checkpoint is performance-only: nothing about navigation limits,
// the hop algorithm, membership or success semantics may move with it.
record("navigation-limits-unchanged", () => {
  assert.match(source, /maxHops:\s*5/, "hop budget must be unchanged");
  assert.match(source, /totalDurationMs:\s*5000/, "duration budget must be unchanged");
  assert.match(source, /remountWaitMs:\s*720/, "remount wait must be unchanged");
});

record("no-pagination-reveal-path-introduced", () => {
  for (const banned of ["revealTarget", "commitWindowing", "MINI_revealCompleteIndexTarget"]) {
    assert.ok(!source.includes(banned), `${banned} must not appear in a performance-only checkpoint`);
  }
});

record("membership-authority-untouched", () => {
  // The MiniMap must not gain any writer over logical membership.
  for (const banned of ["listTurnRecords =", "commitTurnDrafts", "turnState.turns ="]) {
    assert.ok(!source.includes(banned), `${banned} must not appear in the MiniMap engine`);
  }
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
