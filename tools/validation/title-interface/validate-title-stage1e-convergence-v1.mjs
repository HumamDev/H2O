#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  formatNativeDisplayTitle,
  isRTL,
  sanitizeNativeTitle,
} from "../../../packages/title-contract/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const B0_REL = "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js";
const B1_REL = "src-runtime-base/9B1a.🟤🔖 Tab Title 🔖.js";
const B2_REL = "src-runtime-base/9B2a.🟤🏷️ Sidebar Title Renderer 🏷️.js";
const C1_REL = "src-runtime-base/9C1a.🟤📌 Title Under Input bar 📌.js";
const SELF_REL = "tools/validation/title-interface/validate-title-stage1e-convergence-v1.mjs";
const STAGE1C_REL = "tools/validation/title-interface/validate-title-stage1c-formatter-parity.mjs";
const ADR_REL = "docs/decisions/ADR-0011-title-management-contract.md";
const DEV_ORDER_REL = "config/dev-order.tsv";
const LOADER_DEPS_REL = "config/loader-deps.json";
const STAGE1EB_SCOPE_OPTION = "--stage1eb-sidebar-scope";
const STAGE1EB_VALIDATOR_FIX_SCOPE_OPTION = "--stage1eb-validator-fix-scope";
const STAGE1EB_BASELINE_COMMIT = "767c934a3723e6f6cde8209494bf417e91b26187";
const STAGE1EB_IMPLEMENTATION_COMMIT = "6baabd48083333a7e5e06eb9da970c8157626261";
const STAGE1F_SCOPE_OPTION = "--stage1f-rollback-scope";
const STAGE1F_ACCEPTED_HEAD = "262f68410c09e94e42de275992aaefcea928b2d1";
// Stage 1F default-on is a follow-up on the integrated rollback work, so it is
// pinned to its own accepted base and its own exact three-path candidate. The
// historical Stage 1F mode keeps its own parent pin untouched.
const DEFAULT_ON_SCOPE_OPTION = "--title-default-on-scope";
const DEFAULT_ON_ACCEPTED_HEAD = "5d1bc9dca549aca120f5f50ff8f197fcc1f50004";
const F0D_REL = "src-runtime-base/0F0d.⬛️🧬 Library Index Core 🧬.js";
const F1C_REL = "src-runtime-base/0F1c.⬛️🗂️ Library Index 🧮🗂️.js";
const F2A_REL = "src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js";
const F3A_REL = "src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js";
const F6A_REL = "src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js";
const D3A_REL = "src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js";
const FLAG_KEY = "title.threeSurfaceConvergenceV1";
const OVERRIDE_KEY = "__H2O_TITLE_THREE_SURFACE_CONVERGENCE_V1__";
const AUTHORIZED = new Set([B0_REL, B1_REL, C1_REL, SELF_REL, STAGE1C_REL, ADR_REL]);
const AUTHORIZED_TRACKED = new Set(AUTHORIZED);
const STAGE1EB_TRACKED = new Set([DEV_ORDER_REL, LOADER_DEPS_REL, SELF_REL, ADR_REL]);
const STAGE1EB_COMMITTED = new Set([...STAGE1EB_TRACKED, B2_REL]);
// Stage 1F now also repairs the passive sidebar presentation adapter (9B2a).
const STAGE1F_TRACKED = new Set([B0_REL, B1_REL, B2_REL, STAGE1C_REL, SELF_REL]);
const DEFAULT_ON_TRACKED = new Set([B0_REL, SELF_REL, ADR_REL]);
const EXPECTED_IDENTITY = Object.freeze({
  schemaVersion: 2,
  bridgeVersion: "3",
  generatorVersion: "3",
  sourceExportCount: 39,
  publicExportCount: 29,
  privilegedExportCount: 8,
  sourceOnlyExportCount: 2,
  sourceSha256: "57f3fe783b5253d07dafcd7ec4c89b75602337b86d83033ed52fbcc104097b0d",
  publicSurfaceDigest: "d525371c9e82cea7e59351a429120f049b52ca6c3b81ff72eeb599460bc755d3",
});

const b0Source = fs.readFileSync(path.join(ROOT, B0_REL), "utf8");
const b1Source = fs.readFileSync(path.join(ROOT, B1_REL), "utf8");
const c1Source = fs.readFileSync(path.join(ROOT, C1_REL), "utf8");
const b2Source = fs.readFileSync(path.join(ROOT, B2_REL), "utf8");
const readerSources = Object.freeze({
  [F0D_REL]: fs.readFileSync(path.join(ROOT, F0D_REL), "utf8"),
  [F1C_REL]: fs.readFileSync(path.join(ROOT, F1C_REL), "utf8"),
  [F2A_REL]: fs.readFileSync(path.join(ROOT, F2A_REL), "utf8"),
  [F3A_REL]: fs.readFileSync(path.join(ROOT, F3A_REL), "utf8"),
  [F6A_REL]: fs.readFileSync(path.join(ROOT, F6A_REL), "utf8"),
  [D3A_REL]: fs.readFileSync(path.join(ROOT, D3A_REL), "utf8"),
});

const scopeTests = [];
const scenarios = [];
const structuralAssertions = [];

function run(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function splitNul(value) {
  return String(value || "").split("\0").filter(Boolean);
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...actual].every((value) => expected.has(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function functionSlice(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert(start >= 0, `missing function ${name}`);
  assert(end > start, `missing function boundary ${nextName}`);
  return source.slice(start, end);
}

function sourceSlice(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert(start >= 0, `missing source slice start: ${startText}`);
  assert(end > start, `missing source slice end: ${endText}`);
  return source.slice(start, end);
}

const readerSlices = Object.freeze({
  f0dEnsureString: functionSlice(readerSources[F0D_REL], "ensureString", "trimString"),
  f0dNormText: functionSlice(readerSources[F0D_REL], "normText", "slug"),
  f0dChooseBetterTitle: functionSlice(readerSources[F0D_REL], "chooseBetterTitle", "higherConfidence"),
  f1cNative: functionSlice(
    readerSources[F1C_REL],
    "extractNativeRecentTitle",
    "collectNativeRecentDomRows",
  ),
  f2aNative: functionSlice(
    readerSources[F2A_REL],
    "DOM_collectNativeProjectRows",
    "DOM_getNativeProjectRows",
  ),
  f3aNative: functionSlice(
    readerSources[F3A_REL],
    "DOM_extractSidebarChatTitle",
    "DOM_getChatTitleFromSidebar",
  ),
  f3aRendered: functionSlice(
    readerSources[F3A_REL],
    "DOM_menuContextFromAnchor",
    "DOM_anchorFromNearbyContainer",
  ),
  f6aRendered: functionSlice(
    readerSources[F6A_REL],
    "findChatTitleInSidebar",
    "getArchiveBoot",
  ),
  f6aNormText: functionSlice(readerSources[F6A_REL], "normText", "normalizeLabel"),
  f6aIds: functionSlice(readerSources[F6A_REL], "normalizeChatId", "toChatId"),
  f6aSelectors: sourceSlice(readerSources[F6A_REL], "const SEL = {", "const state ="),
  f6aSetRowText: functionSlice(readerSources[F6A_REL], "setRowText", "injectIcon"),
  d3aRendered: functionSlice(
    readerSources[D3A_REL],
    "readSidebarConversationTitle",
    "readConversationHistoryCacheTitle",
  ),
});

const EXPECTED_READER_SLICE_SHA256 = Object.freeze({
  f0dEnsureString: "e942d27c92fa4f14529d9724d3b3c528226b2551fe515a6719331a4474e04314",
  f0dNormText: "388c828537e4bde56303605ed38be3cc3162b420aadd4ec410205413de899b9b",
  f0dChooseBetterTitle: "6a29db4c4a853808f4b15e1e7b68cce394cc2ce74fe2d6a2a81a1b7609ad2b8b",
  f1cNative: "4d4dcadf8c1eebdcd51303d6e8137f0a5efa8255f257767b9f2ca68da8f30076",
  f2aNative: "2f3a124058020cdd85bffc2f999934ed37a5a76e8d01ee1b126ec8d83d21d30f",
  f3aNative: "d07d61c2f336d095c7d186ff20037b23775f41435c197852565fcf15a7704faa",
  f3aRendered: "99cd7c3b33fedc57469d94448cf14ce7397f84d5049f1176889aebd3409abffb",
  f6aRendered: "ab35def2ca439cb85fc49a1d874edb36a589b61a5c72d9bf61057d5eb9445f71",
  f6aNormText: "ec3bac14e827bd38d32c400e20dfaed42a8c346a679fd57f91bce821ededd3aa",
  f6aIds: "045d6232b1d72a4d4c87d5e911dfd4fe708f3b1f2cfee494ff7540bf262efd4f",
  f6aSelectors: "831ec3b4fae9ea0a2835826c6a5d7d86aef6cddad9b7fad8a38fa89505111cdf",
  f6aSetRowText: "083139b85e3119f54fcc3d8292c52a938db39a40c5a8caec876ed63e7d826254",
  d3aRendered: "dcacf7526af9a15f75e9dcd7caec1562262bbf5eb6652e3f1b1ab6aeb3f7837d",
});

const EXPECTED_READER_BLOBS = Object.freeze({
  [F0D_REL]: "278a5ef740edccb33b827fe1b47b97d5a531d86c",
  [F6A_REL]: "f557c45762ac58f581f2862c6c97b771c3ce8967",
});

function classifyScope({ modifiedTracked, staged, untracked, committedHeadPaths = [] }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const headPaths = new Set(committedHeadPaths);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  if (modified.size === 0 && untrackedPaths.size === 0) {
    assert(
      sameSet(headPaths, AUTHORIZED),
      `committed-clean Stage 1E correction scope mismatch: ${JSON.stringify([...headPaths].sort())}`,
    );
    return "stage1e-corrections-committed-clean";
  }
  assert(
    sameSet(modified, AUTHORIZED_TRACKED),
    `tracked Stage 1E correction scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert.equal(untrackedPaths.size, 0, "Stage 1E correction scope forbids untracked paths");
  return "stage1e-corrections-dirty";
}

function classifyStage1EBScope({ modifiedTracked, staged, untracked, committedHeadPaths = [] }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const headPaths = new Set(committedHeadPaths);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  if (modified.size === 0 && untrackedPaths.size === 0) {
    assert(
      sameSet(headPaths, STAGE1EB_COMMITTED),
      `committed-clean Stage 1E-b scope mismatch: ${JSON.stringify([...headPaths].sort())}`,
    );
    return "stage1eb-sidebar-committed-clean";
  }
  assert(
    sameSet(modified, STAGE1EB_TRACKED),
    `tracked Stage 1E-b scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert(
    sameSet(untrackedPaths, new Set([B2_REL])),
    `untracked Stage 1E-b scope mismatch: ${JSON.stringify([...untrackedPaths].sort())}`,
  );
  return "stage1eb-sidebar-dirty";
}

function classifyStage1FScope({ modifiedTracked, staged, untracked, committedHeadPaths = [], head = "", parent = "" }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const headPaths = new Set(committedHeadPaths);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  assert.equal(untrackedPaths.size, 0, `Stage 1F scope forbids untracked paths: ${[...untrackedPaths].sort()}`);
  if (modified.size === 0) {
    assert.equal(parent, STAGE1F_ACCEPTED_HEAD, "Stage 1F commit parent must be the accepted Stage 1E HEAD");
    assert(
      sameSet(headPaths, STAGE1F_TRACKED),
      `committed-clean Stage 1F scope mismatch: ${JSON.stringify([...headPaths].sort())}`,
    );
    return "stage1f-rollback-committed-clean";
  }
  // Dirty Stage 1F work sits either directly on the accepted Stage 1E HEAD or
  // on the single amendable Stage 1F candidate whose parent is that HEAD. Any
  // other base still fails closed.
  assert(
    head === STAGE1F_ACCEPTED_HEAD || parent === STAGE1F_ACCEPTED_HEAD,
    "dirty Stage 1F work requires the accepted Stage 1E HEAD or its single-commit candidate",
  );
  if (head === STAGE1F_ACCEPTED_HEAD) {
    assert(
      sameSet(modified, STAGE1F_TRACKED),
      `tracked Stage 1F scope mismatch: ${JSON.stringify([...modified].sort())}`,
    );
    return "stage1f-rollback-dirty";
  }
  // Amend round: the working set may touch a subset of the candidate, but the
  // candidate as a whole must still be exactly the authorized four paths.
  assert(
    [...modified].every((relative) => STAGE1F_TRACKED.has(relative)),
    `tracked Stage 1F scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert(
    sameSet(new Set([...modified, ...headPaths]), STAGE1F_TRACKED),
    `combined Stage 1F candidate scope mismatch: ${JSON.stringify([...new Set([...modified, ...headPaths])].sort())}`,
  );
  return "stage1f-rollback-dirty";
}

function classifyDefaultOnScope({ modifiedTracked, staged, untracked, committedHeadPaths = [], head = "", parent = "" }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const headPaths = new Set(committedHeadPaths);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  assert.equal(untrackedPaths.size, 0, `default-on scope forbids untracked paths: ${[...untrackedPaths].sort()}`);
  if (modified.size === 0) {
    assert.equal(parent, DEFAULT_ON_ACCEPTED_HEAD, "default-on commit parent must be the integrated Stage 1F HEAD");
    assert(
      sameSet(headPaths, DEFAULT_ON_TRACKED),
      `committed-clean default-on scope mismatch: ${JSON.stringify([...headPaths].sort())}`,
    );
    return "title-default-on-committed-clean";
  }
  assert(
    head === DEFAULT_ON_ACCEPTED_HEAD || parent === DEFAULT_ON_ACCEPTED_HEAD,
    "dirty default-on work requires the integrated Stage 1F HEAD or its single-commit candidate",
  );
  if (head === DEFAULT_ON_ACCEPTED_HEAD) {
    assert(
      sameSet(modified, DEFAULT_ON_TRACKED),
      `tracked default-on scope mismatch: ${JSON.stringify([...modified].sort())}`,
    );
    return "title-default-on-dirty";
  }
  assert(
    [...modified].every((relative) => DEFAULT_ON_TRACKED.has(relative)),
    `tracked default-on scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert(
    sameSet(new Set([...modified, ...headPaths]), DEFAULT_ON_TRACKED),
    `combined default-on candidate scope mismatch: ${JSON.stringify([...new Set([...modified, ...headPaths])].sort())}`,
  );
  return "title-default-on-dirty";
}

function resolveStage1EBScope({
  modifiedTracked,
  staged,
  untracked,
  committedHeadPaths = [],
  combinedProductPaths = [],
  head = "",
  parent = "",
  baselineIsAncestor = false,
  implementationIsAncestor = false,
}, requestedMode) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const currentCommitPaths = new Set(committedHeadPaths);
  const productPaths = new Set(combinedProductPaths);

  if (requestedMode === "stage1eb-sidebar") {
    const mode = classifyStage1EBScope({
      modifiedTracked,
      staged,
      untracked,
      committedHeadPaths,
    });
    const resolvedProductPaths = mode === "stage1eb-sidebar-dirty"
      ? new Set([...modified, ...untrackedPaths])
      : currentCommitPaths;
    assert(
      sameSet(resolvedProductPaths, STAGE1EB_COMMITTED),
      `resolved Stage 1E-b product scope mismatch: ${JSON.stringify([...resolvedProductPaths].sort())}`,
    );
    return Object.freeze({
      mode,
      productPaths: Object.freeze([...resolvedProductPaths].sort()),
      currentCommitPaths: Object.freeze([...currentCommitPaths].sort()),
    });
  }

  assert.equal(
    requestedMode,
    "stage1eb-validator-fix",
    `unsupported Stage 1E-b scope mode: ${String(requestedMode)}`,
  );
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  assert.equal(untrackedPaths.size, 0, `validator repair forbids untracked paths: ${[...untrackedPaths].sort()}`);
  assert.equal(baselineIsAncestor, true, "Stage 1E-b baseline must be an ancestor of the candidate");
  assert.equal(
    implementationIsAncestor,
    true,
    "accepted Stage 1E-b implementation must be an ancestor of the candidate",
  );
  assert(
    sameSet(productPaths, STAGE1EB_COMMITTED),
    `combined Stage 1E-b product scope mismatch: ${JSON.stringify([...productPaths].sort())}`,
  );

  if (modified.size > 0) {
    assert.equal(head, STAGE1EB_IMPLEMENTATION_COMMIT, "dirty validator repair requires accepted Stage 1E-b HEAD");
    assert.equal(parent, STAGE1EB_BASELINE_COMMIT, "accepted Stage 1E-b implementation parent mismatch");
    assert(
      sameSet(currentCommitPaths, STAGE1EB_COMMITTED),
      `accepted Stage 1E-b implementation scope mismatch: ${JSON.stringify([...currentCommitPaths].sort())}`,
    );
    assert(
      sameSet(modified, new Set([SELF_REL])),
      `dirty validator repair requires exactly ${SELF_REL}: ${JSON.stringify([...modified].sort())}`,
    );
    return Object.freeze({
      mode: "stage1eb-validator-fix-dirty",
      productPaths: Object.freeze([...productPaths].sort()),
      currentCommitPaths: Object.freeze([...currentCommitPaths].sort()),
    });
  }

  assert.notEqual(head, STAGE1EB_IMPLEMENTATION_COMMIT, "committed validator repair requires a new commit");
  assert.equal(parent, STAGE1EB_IMPLEMENTATION_COMMIT, "validator repair parent must be accepted Stage 1E-b");
  assert(
    sameSet(currentCommitPaths, new Set([SELF_REL])),
    `validator repair commit must modify exactly ${SELF_REL}: ${JSON.stringify([...currentCommitPaths].sort())}`,
  );
  return Object.freeze({
    mode: "stage1eb-validator-fix-committed-clean",
    productPaths: Object.freeze([...productPaths].sort()),
    currentCommitPaths: Object.freeze([...currentCommitPaths].sort()),
  });
}

function requestedScopeMode(argv) {
  assert(
    argv.length === 0
      || (
        argv.length === 1
        && (
          argv[0] === STAGE1EB_SCOPE_OPTION
          || argv[0] === STAGE1EB_VALIDATOR_FIX_SCOPE_OPTION
          || argv[0] === STAGE1F_SCOPE_OPTION
          || argv[0] === DEFAULT_ON_SCOPE_OPTION
        )
      ),
    `unknown or conflicting Stage 1E validator option: ${argv.join(" ")}`,
  );
  if (argv[0] === STAGE1EB_SCOPE_OPTION) return "stage1eb-sidebar";
  if (argv[0] === STAGE1EB_VALIDATOR_FIX_SCOPE_OPTION) return "stage1eb-validator-fix";
  if (argv[0] === STAGE1F_SCOPE_OPTION) return "stage1f-rollback";
  if (argv[0] === DEFAULT_ON_SCOPE_OPTION) return "title-default-on";
  return "stage1ea";
}

function isAncestor(ancestor, descendant) {
  try {
    run("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function currentScope() {
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  const parent = run("git", ["rev-parse", "HEAD^"]).trim();
  const untracked = splitNul(run("git", ["ls-files", "-z", "--others", "--exclude-standard", "--"]));
  return {
    modifiedTracked: splitNul(run("git", ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"])),
    staged: splitNul(run("git", ["diff", "--cached", "--name-only", "-z", "--"])),
    untracked,
    committedHeadPaths: splitNul(run("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD^", "HEAD", "--"])),
    combinedProductPaths: [
      ...splitNul(run("git", ["diff", "--name-only", "-z", STAGE1EB_BASELINE_COMMIT, "--"])),
      ...untracked,
    ],
    head,
    parent,
    baselineIsAncestor: isAncestor(STAGE1EB_BASELINE_COMMIT, head),
    implementationIsAncestor: isAncestor(STAGE1EB_IMPLEMENTATION_COMMIT, head),
  };
}

function scopeTest(name, callback) {
  callback();
  scopeTests.push(name);
  console.log(`ok scope ${scopeTests.length} - ${name}`);
}

async function scenario(name, callback) {
  await callback();
  scenarios.push(name);
  console.log(`ok ${scenarios.length} - ${name}`);
}

function structuralTest(name, callback) {
  callback();
  structuralAssertions.push(name);
  console.log(`ok structural ${structuralAssertions.length} - ${name}`);
}

const requestedMode = requestedScopeMode(process.argv.slice(2));
const actualScope = currentScope();
const stage1EBScopeResolution = requestedMode === "stage1eb-sidebar"
  || requestedMode === "stage1eb-validator-fix"
  ? resolveStage1EBScope(actualScope, requestedMode)
  : null;
const scopeMode = requestedMode === "title-default-on"
  ? classifyDefaultOnScope(actualScope)
  : requestedMode === "stage1f-rollback"
  ? classifyStage1FScope(actualScope)
  : (stage1EBScopeResolution?.mode || classifyScope(actualScope));

// Stage 1F gate: the candidate is exactly five paths and stays fail-closed for
// every partial, foreign, staged, untracked, generated or mis-based shape.
const STAGE1F_CANDIDATE = [...STAGE1F_TRACKED];
scopeTest("Stage 1F exact dirty five-file scope on the accepted head is accepted", () => {
  assert.equal(classifyStage1FScope({
    modifiedTracked: STAGE1F_CANDIDATE,
    staged: [],
    untracked: [],
    head: STAGE1F_ACCEPTED_HEAD,
  }), "stage1f-rollback-dirty");
});
scopeTest("Stage 1F committed-clean five-file candidate is accepted", () => {
  assert.equal(classifyStage1FScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: STAGE1F_CANDIDATE,
    head: "0000000000000000000000000000000000000000",
    parent: STAGE1F_ACCEPTED_HEAD,
  }), "stage1f-rollback-committed-clean");
});
scopeTest("Stage 1F amend round accepts a subset whose union is the candidate", () => {
  assert.equal(classifyStage1FScope({
    modifiedTracked: [B2_REL, SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: STAGE1F_CANDIDATE,
    head: "0000000000000000000000000000000000000000",
    parent: STAGE1F_ACCEPTED_HEAD,
  }), "stage1f-rollback-dirty");
});
scopeTest("Stage 1F rejects a partial candidate", () => {
  assert.throws(() => classifyStage1FScope({
    modifiedTracked: [B0_REL, B1_REL, B2_REL, SELF_REL],
    staged: [],
    untracked: [],
    head: STAGE1F_ACCEPTED_HEAD,
  }), /tracked Stage 1F scope mismatch/u);
  assert.throws(() => classifyStage1FScope({
    modifiedTracked: [B2_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [B0_REL, B1_REL],
    head: "0000000000000000000000000000000000000000",
    parent: STAGE1F_ACCEPTED_HEAD,
  }), /combined Stage 1F candidate scope mismatch/u);
});
scopeTest("Stage 1F rejects foreign, disabled, generated and publication paths", () => {
  for (const foreign of [
    "foreign.js",
    "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js",
    "apps/dev-server/alias/9B2a._Sidebar_Title_Renderer_.js",
    "tools/publish/canonical-write-guard.mjs",
    C1_REL,
  ]) {
    assert.throws(() => classifyStage1FScope({
      modifiedTracked: [...STAGE1F_CANDIDATE, foreign],
      staged: [],
      untracked: [],
      head: STAGE1F_ACCEPTED_HEAD,
    }), /tracked Stage 1F scope mismatch/u, `must reject ${foreign}`);
  }
});
scopeTest("Stage 1F rejects staged and untracked paths", () => {
  assert.throws(() => classifyStage1FScope({
    modifiedTracked: STAGE1F_CANDIDATE,
    staged: [B2_REL],
    untracked: [],
    head: STAGE1F_ACCEPTED_HEAD,
  }), /staged paths forbidden/u);
  assert.throws(() => classifyStage1FScope({
    modifiedTracked: STAGE1F_CANDIDATE,
    staged: [],
    untracked: ["src-runtime-base/9B2a.generated.js"],
    head: STAGE1F_ACCEPTED_HEAD,
  }), /forbids untracked paths/u);
});
scopeTest("Stage 1F rejects a wrong base commit", () => {
  assert.throws(() => classifyStage1FScope({
    modifiedTracked: STAGE1F_CANDIDATE,
    staged: [],
    untracked: [],
    head: "1111111111111111111111111111111111111111",
    parent: "2222222222222222222222222222222222222222",
  }), /requires the accepted Stage 1E HEAD/u);
  assert.throws(() => classifyStage1FScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: STAGE1F_CANDIDATE,
    parent: "2222222222222222222222222222222222222222",
  }), /parent must be the accepted Stage 1E HEAD/u);
});
// Default-on gate: exactly three paths, fail-closed on every other shape.
const DEFAULT_ON_CANDIDATE = [...DEFAULT_ON_TRACKED];
scopeTest("default-on exact dirty scope on the integrated head is accepted", () => {
  assert.equal(classifyDefaultOnScope({
    modifiedTracked: DEFAULT_ON_CANDIDATE,
    staged: [],
    untracked: [],
    head: DEFAULT_ON_ACCEPTED_HEAD,
  }), "title-default-on-dirty");
});
scopeTest("default-on committed-clean candidate is accepted", () => {
  assert.equal(classifyDefaultOnScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: DEFAULT_ON_CANDIDATE,
    parent: DEFAULT_ON_ACCEPTED_HEAD,
  }), "title-default-on-committed-clean");
});
scopeTest("default-on rejects partial and mixed candidates", () => {
  assert.throws(() => classifyDefaultOnScope({
    modifiedTracked: [B0_REL, SELF_REL],
    staged: [],
    untracked: [],
    head: DEFAULT_ON_ACCEPTED_HEAD,
  }), /tracked default-on scope mismatch/u);
  assert.throws(() => classifyDefaultOnScope({
    modifiedTracked: [B0_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [SELF_REL],
    parent: DEFAULT_ON_ACCEPTED_HEAD,
  }), /combined default-on candidate scope mismatch/u);
});
scopeTest("default-on rejects foreign, protected, generated and publication paths", () => {
  for (const foreign of [
    B1_REL,
    B2_REL,
    C1_REL,
    STAGE1C_REL,
    "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js",
    "apps/dev-server/alias/9B0a._Chat_Title_State_.js",
    "tools/publish/lean-publisher.mjs",
    "package.json",
  ]) {
    assert.throws(() => classifyDefaultOnScope({
      modifiedTracked: [...DEFAULT_ON_CANDIDATE, foreign],
      staged: [],
      untracked: [],
      head: DEFAULT_ON_ACCEPTED_HEAD,
    }), /tracked default-on scope mismatch/u, `must reject ${foreign}`);
  }
});
scopeTest("default-on rejects staged and untracked paths", () => {
  assert.throws(() => classifyDefaultOnScope({
    modifiedTracked: DEFAULT_ON_CANDIDATE,
    staged: [B0_REL],
    untracked: [],
    head: DEFAULT_ON_ACCEPTED_HEAD,
  }), /staged paths forbidden/u);
  assert.throws(() => classifyDefaultOnScope({
    modifiedTracked: DEFAULT_ON_CANDIDATE,
    staged: [],
    untracked: ["tools/publish/lean-publisher.mjs"],
    head: DEFAULT_ON_ACCEPTED_HEAD,
  }), /forbids untracked paths/u);
});
scopeTest("default-on rejects a wrong base commit", () => {
  assert.throws(() => classifyDefaultOnScope({
    modifiedTracked: DEFAULT_ON_CANDIDATE,
    staged: [],
    untracked: [],
    head: STAGE1F_ACCEPTED_HEAD,
    parent: STAGE1F_ACCEPTED_HEAD,
  }), /requires the integrated Stage 1F HEAD/u);
  assert.throws(() => classifyDefaultOnScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: DEFAULT_ON_CANDIDATE,
    parent: STAGE1F_ACCEPTED_HEAD,
  }), /parent must be the integrated Stage 1F HEAD/u);
});
scopeTest("default-on option is rejected when combined with another scope option", () => {
  assert.throws(() => requestedScopeMode([DEFAULT_ON_SCOPE_OPTION, STAGE1F_SCOPE_OPTION]), /unknown or conflicting/u);
  assert.equal(requestedScopeMode([DEFAULT_ON_SCOPE_OPTION]), "title-default-on");
});
scopeTest("exact authorized six-file scope is accepted", () => {
  assert.equal(classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [],
    untracked: [],
  }), "stage1e-corrections-dirty");
});
scopeTest("exact committed-clean correction scope is accepted", () => {
  assert.equal(classifyScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: [...AUTHORIZED],
  }), "stage1e-corrections-committed-clean");
});
scopeTest("seventh tracked path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "foreign.js"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("seventh untracked path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [],
    untracked: ["foreign.tmp"],
  }), /forbids untracked paths/u);
});
scopeTest("staged path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [B0_REL],
    untracked: [],
  }), /staged paths forbidden/u);
});
scopeTest("config change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "config/dev-order.tsv"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("disabled 9D1a change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("generated output change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "apps/dev-server/alias/9B0a._Chat_Title_State_.js"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("publication-safety change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "tools/publish/canonical-write-guard.mjs"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("exact Stage 1E-b dirty scope is accepted", () => {
  assert.equal(classifyStage1EBScope({
    modifiedTracked: [...STAGE1EB_TRACKED],
    staged: [],
    untracked: [B2_REL],
  }), "stage1eb-sidebar-dirty");
});
scopeTest("exact Stage 1E-b committed-clean scope is accepted", () => {
  assert.equal(classifyStage1EBScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
  }), "stage1eb-sidebar-committed-clean");
});
scopeTest("Stage 1E-b rejects staged and every class of sixth tracked path", () => {
  for (const foreign of [
    B0_REL,
    "config/dev-order-foreign.tsv",
    "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js",
    "apps/dev-server/alias/9B2a._Sidebar_Title_Renderer_.js",
    "tools/publish/canonical-write-guard.mjs",
  ]) {
    assert.throws(() => classifyStage1EBScope({
      modifiedTracked: [...STAGE1EB_TRACKED, foreign],
      staged: [],
      untracked: [B2_REL],
    }), /tracked Stage 1E-b scope mismatch/u);
  }
  assert.throws(() => classifyStage1EBScope({
    modifiedTracked: [...STAGE1EB_TRACKED],
    staged: [DEV_ORDER_REL],
    untracked: [B2_REL],
  }), /staged paths forbidden/u);
});
scopeTest("Stage 1E-b rejects a second untracked path", () => {
  assert.throws(() => classifyStage1EBScope({
    modifiedTracked: [...STAGE1EB_TRACKED],
    staged: [],
    untracked: [B2_REL, "foreign.js"],
  }), /untracked Stage 1E-b scope mismatch/u);
});
scopeTest("Stage 1E-b CLI fails closed for unknown or conflicting options", () => {
  assert.equal(
    requestedScopeMode([STAGE1EB_VALIDATOR_FIX_SCOPE_OPTION]),
    "stage1eb-validator-fix",
  );
  assert.throws(() => requestedScopeMode(["--unknown"]), /unknown or conflicting/u);
  assert.throws(
    () => requestedScopeMode([STAGE1EB_SCOPE_OPTION, STAGE1EB_SCOPE_OPTION]),
    /unknown or conflicting/u,
  );
  assert.throws(
    () => requestedScopeMode([STAGE1EB_SCOPE_OPTION, STAGE1EB_VALIDATOR_FIX_SCOPE_OPTION]),
    /unknown or conflicting/u,
  );
});
scopeTest("dirty validator-only repair is accepted only by its explicit mode", () => {
  const input = {
    modifiedTracked: [SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  };
  assert.equal(
    resolveStage1EBScope(input, "stage1eb-validator-fix").mode,
    "stage1eb-validator-fix-dirty",
  );
  assert.throws(() => classifyStage1EBScope(input), /tracked Stage 1E-b scope mismatch/u);
});
scopeTest("committed validator-only repair is accepted by its explicit mode", () => {
  assert.equal(resolveStage1EBScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: [SELF_REL],
    combinedProductPaths: [...STAGE1EB_COMMITTED],
    head: "validator-repair-commit",
    parent: STAGE1EB_IMPLEMENTATION_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  }, "stage1eb-validator-fix").mode, "stage1eb-validator-fix-committed-clean");
});
scopeTest("validator repair rejects a second modified file", () => {
  assert.throws(() => resolveStage1EBScope({
    modifiedTracked: [SELF_REL, ADR_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  }, "stage1eb-validator-fix"), /requires exactly/u);
});
scopeTest("validator repair rejects an untracked path", () => {
  const base = {
    modifiedTracked: [SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  };
  assert.throws(
    () => resolveStage1EBScope({ ...base, untracked: ["foreign.js"] }, "stage1eb-validator-fix"),
    /forbids untracked/u,
  );
});
scopeTest("validator repair rejects a staged path", () => {
  const base = {
    modifiedTracked: [SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  };
  assert.throws(
    () => resolveStage1EBScope({ ...base, staged: [SELF_REL] }, "stage1eb-validator-fix"),
    /staged paths forbidden/u,
  );
});
scopeTest("validator repair rejects wrong parent and ancestry", () => {
  const base = {
    modifiedTracked: [SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  };
  assert.throws(
    () => resolveStage1EBScope({ ...base, parent: "wrong-parent" }, "stage1eb-validator-fix"),
    /parent mismatch/u,
  );
  assert.throws(
    () => resolveStage1EBScope({ ...base, baselineIsAncestor: false }, "stage1eb-validator-fix"),
    /baseline must be an ancestor/u,
  );
  assert.throws(
    () => resolveStage1EBScope({ ...base, implementationIsAncestor: false }, "stage1eb-validator-fix"),
    /implementation must be an ancestor/u,
  );
});
scopeTest("validator repair rejects a sixth combined product path", () => {
  assert.throws(() => resolveStage1EBScope({
    modifiedTracked: [SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED, ADR_REL.replace("ADR-0011", "ADR-foreign")],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  }, "stage1eb-validator-fix"), /combined Stage 1E-b product scope mismatch/u);
});
scopeTest("validator repair rejects generated output in the combined product scope", () => {
  assert.throws(() => resolveStage1EBScope({
    modifiedTracked: [SELF_REL],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
    combinedProductPaths: [...STAGE1EB_COMMITTED, "apps/dev-server/alias/9B2a._Sidebar_Title_Renderer_.js"],
    head: STAGE1EB_IMPLEMENTATION_COMMIT,
    parent: STAGE1EB_BASELINE_COMMIT,
    baselineIsAncestor: true,
    implementationIsAncestor: true,
  }, "stage1eb-validator-fix"), /combined Stage 1E-b product scope mismatch/u);
});

function makeEventHub() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      if (typeof handler !== "function") return;
      const set = listeners.get(name) || new Set();
      set.add(handler);
      listeners.set(name, set);
    },
    removeEventListener(name, handler) {
      listeners.get(name)?.delete(handler);
    },
    dispatchEvent(event) {
      for (const handler of [...(listeners.get(event?.type) || [])]) handler.call(this, event);
      return true;
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
    countFor(name) {
      return listeners.get(name)?.size || 0;
    },
  };
}

function makeEffects() {
  return {
    fetches: [],
    storageOps: [],
    dispatched: [],
    timers: new Map(),
    observers: new Set(),
    abortControllers: 0,
    documentTitleAssignments: 0,
    detachedDomAccesses: [],
    resetTransient() {
      this.fetches.length = 0;
      this.storageOps.length = 0;
      this.dispatched.length = 0;
    },
  };
}

function makeStorage(effects, seed = null) {
  const values = new Map(seed ? Object.entries(seed) : []);
  return {
    entries() {
      return Object.fromEntries(values);
    },
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      const k = String(key);
      const v = String(value);
      values.set(k, v);
      effects.storageOps.push({ type: "set", key: k, value: v });
    },
    removeItem(key) {
      const k = String(key);
      values.delete(k);
      effects.storageOps.push({ type: "remove", key: k });
    },
    snapshot() {
      return JSON.stringify([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));
    },
  };
}

function makeTimers(effects) {
  let nextId = 1;
  const set = (kind, callback, delay) => {
    const id = nextId++;
    effects.timers.set(id, { kind, callback, delay });
    return id;
  };
  return {
    setTimeout(callback, delay) {
      return set("timeout", callback, delay);
    },
    clearTimeout(id) {
      effects.timers.delete(id);
    },
    setInterval(callback, delay) {
      return set("interval", callback, delay);
    },
    clearInterval(id) {
      effects.timers.delete(id);
    },
    requestAnimationFrame(callback) {
      return set("frame", callback, 0);
    },
    cancelAnimationFrame(id) {
      effects.timers.delete(id);
    },
  };
}

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    clone() {
      return {
        async json() {
          return body;
        },
      };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(count = 5) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

function installContractBridge(context, sandbox, kind) {
  if (kind === "absent") return;
  sandbox.__contractSanitize = sanitizeNativeTitle;
  sandbox.__contractFormat = formatNativeDisplayTitle;
  sandbox.__contractIsRTL = isRTL;
  sandbox.__contractIdentity = {
    ...EXPECTED_IDENTITY,
    ...(kind === "invalid" ? { bridgeVersion: "stale" } : {}),
  };
  vm.runInContext(`
    {
      const identity = Object.freeze({ ...globalThis.__contractIdentity });
      const contract = {
        identity,
        isRTL(value) {
          return globalThis.__contractIsRTL(value);
        },
        sanitizeNativeTitle(value) {
          return globalThis.__contractSanitize(value);
        },
        formatNativeDisplayTitle(baseTitle, emoji) {
          const result = globalThis.__contractFormat(baseTitle, emoji);
          return Object.freeze({ text: String(result.text), dir: String(result.dir) });
        },
      };
      Object.freeze(contract);
      Object.defineProperty(H2O, "TitleContract", {
        value: contract,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
  `, context);
}

function instrumentB0(source) {
  const anchor = "\n  boot();\n";
  const setTitleAnchor = "  function setTitle(payload, options) {\n";
  assert.equal(source.split(anchor).length - 1, 1, "9B0a boot anchor drifted");
  assert.equal(source.split(setTitleAnchor).length - 1, 1, "9B0a setTitle anchor drifted");
  return source.replace(setTitleAnchor, `${setTitleAnchor}    W.__H2O_STAGE1E_SET_TITLE_CALLS__ = Number(W.__H2O_STAGE1E_SET_TITLE_CALLS__ || 0) + 1;\n`)
    .replace(anchor, `
  W.__H2O_STAGE1E_B0_TEST__ = Object.freeze({
    displayFrom,
    legacyDisplayFrom,
    sanitizeNativeBaseTitle,
    splitNativeSubmission,
    readSidebarTitle,
    readLibraryTitle,
    detectTitles,
    resolveConvergenceStatus,
    currentRecord: () => ({ ...activeRecord }),
    recordFor: (chatId) => {
      const record = records.get(chatId);
      return record ? { ...record } : null;
    },
    currentRouteToken: () => routeToken,
    currentConvergence: () => ({ ...lastConvergenceStatus }),
    setTitleCallCount: () => Number(W.__H2O_STAGE1E_SET_TITLE_CALLS__ || 0),
    activeRename: () => activeRenameOperation ? {
      operationId: activeRenameOperation.operationId,
      chatId: activeRenameOperation.chatId,
      routeToken: activeRenameOperation.routeToken,
    } : null,
    flagListenerInstalled: () => convergenceFlagListenerInstalled,
    destroy,
  });
  boot();
`);
}

function createB0Harness({ flag = false, bridge = "valid", documentTitle = "Initial base - ChatGPT", storageSeed = null, store = "durable", flagsRegistry = "ready" } = {}) {
  const effects = makeEffects();
  const sidebarDom = createMiniDom(effects);
  const storage = makeStorage(effects, storageSeed);
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const documentEvents = makeEventHub();
  const titleNode = {};
  let sidebarEntry = null;
  const sidebarRows = [];
  let persistFailure = "";
  const libraryRows = new Map();
  let fetchHandler = async (url) => (
    url === "/api/auth/session"
      ? response({ body: { accessToken: "stage1e-token" } })
      : response()
  );

  class CustomEventMock {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  class MutationObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      effects.observers.add(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }
  class AbortControllerMock extends AbortController {
    constructor() {
      super();
      effects.abortControllers += 1;
    }
  }

  const location = {
    pathname: "/c/stage1e-chat-a",
    href: "https://chatgpt.com/c/stage1e-chat-a",
    origin: "https://chatgpt.com",
    search: "",
  };
  const document = {
    ...documentEvents,
    title: documentTitle,
    hidden: false,
    readyState: "complete",
    body: {},
    documentElement: {},
    querySelector(selector) {
      if (selector === "title") return titleNode;
      if (/^(?:aside|nav) /u.test(String(selector || ""))) return sidebarEntry;
      return null;
    },
    querySelectorAll(selector) {
      const value = String(selector || "");
      const match = value.match(/\/c\/([a-z0-9_-]+)/iu);
      if (!match) return [];
      return sidebarRows.filter(
        (anchor) => String(anchor.getAttribute("href") || "").includes(`/c/${match[1]}`),
      );
    },
    createTreeWalker(root, show, filter) {
      return sidebarDom.document.createTreeWalker(root, show, filter);
    },
  };
  const history = {
    pushState() {},
    replaceState() {},
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document,
    location,
    history,
    localStorage: storage,
    sessionStorage: makeStorage(effects),
    console: { log() {}, warn() {}, error() {} },
    CustomEvent: CustomEventMock,
    MutationObserver: MutationObserverMock,
    AbortController: AbortControllerMock,
    NodeFilter: {
      SHOW_TEXT: 4,
      FILTER_REJECT: 2,
      FILTER_ACCEPT: 1,
    },
    URL,
    URLSearchParams,
    encodeURIComponent,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
  };
  sandbox.window = sandbox;
  sandbox.fetch = async (url, options = {}) => {
    effects.fetches.push({ url: String(url), options });
    return fetchHandler(String(url), options);
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(`
    globalThis.H2O = {
      flags: {
        get(name, fallback) {
          if (name !== ${JSON.stringify(FLAG_KEY)}) return fallback;
          return Object.prototype.hasOwnProperty.call(globalThis, "__stage1eFlagValue")
            ? globalThis.__stage1eFlagValue
            : fallback;
        },
        set(name, value) {
          if (name === ${JSON.stringify(FLAG_KEY)}) globalThis.__stage1eFlagValue = value;
          return true;
        },
      },
      util: {
        getChatId() {
          const match = String(globalThis.location.pathname || "").match(/\\/c\\/([a-z0-9_-]+)/i);
          return match ? match[1] : "";
        },
      },
    };
  `, context);
  if (flag === "unset") delete sandbox.__stage1eFlagValue;
  else sandbox.__stage1eFlagValue = flag;
  sandbox.H2O.LibraryIndex = {
    getChat(chatId) {
      return libraryRows.get(String(chatId || "")) || null;
    },
  };
  // Real durable Store so persistRecord executes its actual success/failure branches.
  const storeRecords = new Map();
  let storeSetCalls = 0;
  if (store !== "none") sandbox.H2O.Library = {
    Store: {
      caps() {
        return { ready: true, durable: true, health: "ok" };
      },
      backend() {
        return "stage1e-store";
      },
      async get(key) {
        return storeRecords.get(String(key)) || null;
      },
      async set(key, value) {
        storeSetCalls += 1;
        if (persistFailure) {
          const message = persistFailure;
          persistFailure = "";
          throw new Error(message);
        }
        storeRecords.set(String(key), value);
        return true;
      },
    },
  };
  installContractBridge(context, sandbox, bridge);
  const deferredFlagsRegistry = sandbox.H2O.flags;
  if (flagsRegistry === "late") delete sandbox.H2O.flags;
  const instrumentedB0Source = instrumentB0(b0Source);
  new vm.Script(instrumentedB0Source, { filename: `${B0_REL}:stage1e-harness` }).runInContext(context);
  effects.resetTransient();

  return {
    sandbox,
    context,
    effects,
    storage,
    hook: sandbox.__H2O_STAGE1E_B0_TEST__,
    api: sandbox.H2O.ChatTitle,
    setFlag(value) {
      if (value === "unset") delete sandbox.__stage1eFlagValue;
      else sandbox.__stage1eFlagValue = value;
    },
    flagsRegistryPresent() {
      return typeof sandbox.H2O.flags?.get === "function";
    },
    // 0F1k mutates the same H2O namespace object 9B0a already captured and
    // dispatches no readiness event, exactly as the live loader does.
    installFlagsRegistry() {
      sandbox.H2O.flags = deferredFlagsRegistry;
      return sandbox.H2O.flags;
    },
    storedFlag() {
      return Object.prototype.hasOwnProperty.call(sandbox, "__stage1eFlagValue")
        ? { present: true, value: sandbox.__stage1eFlagValue }
        : { present: false, value: undefined };
    },
    setRuntimeFlag(value) {
      return sandbox.H2O.flags.set(FLAG_KEY, value);
    },
    setSessionOverride(value) {
      if (value === undefined) delete sandbox[OVERRIDE_KEY];
      else sandbox[OVERRIDE_KEY] = value;
    },
    setFetch(handler) {
      fetchHandler = handler;
    },
    setRoute(pathname) {
      location.pathname = pathname;
      location.href = `https://chatgpt.com${pathname}`;
    },
    setDocumentTitle(value) {
      document.title = value;
    },
    addForeignSidebarRow(chatId, nativeText) {
      const anchor = sidebarDom.document.createElement("a");
      anchor.setAttribute("href", `/c/${chatId}`);
      const layout = sidebarDom.document.createElement("div");
      const native = sidebarDom.document.createElement("span");
      native.className = "truncate";
      native.textContent = String(nativeText || "");
      layout.appendChild(native);
      anchor.appendChild(layout);
      sidebarDom.document.body.appendChild(anchor);
      sidebarRows.push(anchor);
      return { anchor, layout, native };
    },
    setStoreRecord(key, value) {
      storeRecords.set(String(key), value);
    },
    failNextPersist(message) {
      persistFailure = String(message || "bridge timeout (1500ms)");
    },
    storeSetCalls() { return storeSetCalls; },
    runTimers(kind) {
      for (const [id, timer] of [...effects.timers]) {
        if (kind && timer.kind !== kind) continue;
        if (timer.kind !== "interval") effects.timers.delete(id);
        timer.callback();
      }
    },
    setSidebarReaderFixture(nativeText, displayText) {
      const anchor = sidebarDom.document.createElement("a");
      anchor.setAttribute("href", "/c/stage1e-chat-a");
      const layout = sidebarDom.document.createElement("div");
      const native = sidebarDom.document.createElement("span");
      native.className = "truncate";
      native.textContent = String(nativeText || "");
      const visual = sidebarDom.document.createElement("span");
      visual.setAttribute("data-h2o-owner", "title-sidebar-renderer");
      visual.setAttribute("data-h2o-title-role", "visual");
      visual.textContent = String(displayText || "");
      layout.append(native, visual);
      anchor.appendChild(layout);
      sidebarDom.document.body.appendChild(anchor);
      sidebarEntry = anchor;
      sidebarRows.push(anchor);
      return {
        anchor,
        layout,
        native,
        visual,
        removeVisualOwnership() {
          visual.removeAttribute("data-h2o-owner");
        },
        restoreVisualOwnership() {
          visual.setAttribute("data-h2o-owner", "title-sidebar-renderer");
        },
        replaceNative(nextText) {
          native.remove();
          const replacement = sidebarDom.document.createElement("span");
          replacement.className = "truncate";
          replacement.textContent = String(nextText || "");
          layout.prepend(replacement);
          return replacement;
        },
      };
    },
    setLibraryTitle(chatId, title) {
      libraryRows.set(String(chatId || ""), { chatId: String(chatId || ""), title: String(title || "") });
    },
    clearLibraryTitle(chatId) {
      libraryRows.delete(String(chatId || ""));
    },
    flagListenerCount() {
      return windowEvents.countFor("h2o:flags:changed");
    },
    triggerObservers() {
      for (const observer of effects.observers) {
        if (observer.active) observer.callback([]);
      }
    },
    reinstall() {
      delete sandbox.__h2oChatTitleStateBooted_v1;
      delete sandbox.H2O.ChatTitle;
      new vm.Script(instrumentedB0Source, { filename: `${B0_REL}:stage1e-reinstall-harness` })
        .runInContext(context);
    },
  };
}

function createTabHarness(initialState) {
  const effects = makeEffects();
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const documentEvents = makeEventHub();
  let currentState = initialState;
  let subscriber = null;
  let activeSubscriptions = 0;
  let titleWritesMarked = 0;

  class HTMLElementMock {
    constructor() {
      this.hidden = false;
      this.isConnected = true;
    }
    getAttribute() {
      return "";
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
    getBoundingClientRect() {
      return { width: 100, height: 20 };
    }
  }
  class MutationObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      effects.observers.add(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }

  const documentElement = new HTMLElementMock();
  let documentTitle = "Native fallback - ChatGPT";
  const document = {
    ...documentEvents,
    readyState: "complete",
    documentElement,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  Object.defineProperty(document, "title", {
    configurable: true,
    enumerable: true,
    get() {
      return documentTitle;
    },
    set(value) {
      documentTitle = String(value);
      effects.documentTitleAssignments += 1;
    },
  });
  const history = {
    pushState() {},
    replaceState() {},
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document,
    location: {
      pathname: "/c/stage1e-chat-a",
      href: "https://chatgpt.com/c/stage1e-chat-a",
      origin: "https://chatgpt.com",
      search: "",
    },
    history,
    console: { log() {}, warn() {}, error() {} },
    MutationObserver: MutationObserverMock,
    HTMLElement: HTMLElementMock,
    Element: HTMLElementMock,
    URL,
    URLSearchParams,
    Date,
    Math,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    },
  };
  sandbox.window = sandbox;
  sandbox.H2O = {
    ChatTitle: {
      subscribe(callback) {
        subscriber = callback;
        activeSubscriptions += 1;
        callback(currentState);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          activeSubscriptions -= 1;
          if (subscriber === callback) subscriber = null;
        };
      },
      getState() {
        return currentState;
      },
      markDocumentTitleWrite() {
        titleWritesMarked += 1;
      },
      refresh() {},
    },
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(b1Source, { filename: `${B1_REL}:stage1e-harness` });

  return {
    sandbox,
    effects,
    document,
    evaluate() {
      script.runInContext(context);
    },
    emit(nextState) {
      currentState = nextState;
      subscriber?.(nextState);
    },
    activeSubscriptions() {
      return activeSubscriptions;
    },
    titleWritesMarked() {
      return titleWritesMarked;
    },
    listenerCount() {
      return windowEvents.count() + documentEvents.count();
    },
    activeTimerCount() {
      return effects.timers.size;
    },
    activeObserverCount() {
      return [...effects.observers].filter((observer) => observer.active).length;
    },
    titleAssignments() {
      return effects.documentTitleAssignments;
    },
    triggerObservers() {
      for (const observer of effects.observers) {
        if (observer.active) observer.callback([]);
      }
    },
    storeSetCalls() { return storeSetCalls; },
    runTimers(kind) {
      for (const [id, timer] of [...effects.timers]) {
        if (kind && timer.kind !== kind) continue;
        if (timer.kind !== "interval") effects.timers.delete(id);
        timer.callback();
      }
    },
  };
}

function makeDomEvent(type, properties = {}) {
  return {
    type,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
      this.propagationStopped = true;
    },
    ...properties,
  };
}

function createMiniDom(effects) {
  const documentEvents = makeEventHub();
  const allElements = new Set();
  let documentRef = null;

  function selectorMatches(element, selector) {
    const value = String(selector || "").trim();
    if (!value) return false;
    if (value.includes(" ")) {
      const parts = value.split(/\s+/u);
      return selectorMatches(element, parts[parts.length - 1]);
    }
    const tagMatch = value.match(/^[a-z][a-z0-9-]*/iu);
    if (tagMatch && element.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    const idMatch = value.match(/#([a-z0-9_-]+)/iu);
    if (idMatch && element.id !== idMatch[1]) return false;
    for (const match of value.matchAll(/\.([a-z0-9_-]+)/giu)) {
      if (!element.classList.contains(match[1])) return false;
    }
    for (const match of value.matchAll(/\[([^\]=~*^$|]+)(?:([~*^$|]?=)["']?([^"'\]]*)["']?)?\]/gu)) {
      const name = match[1];
      const operator = match[2] || "";
      const expected = match[3] || "";
      const actual = element.getAttribute(name);
      if (actual === null) return false;
      if (operator === "=" && actual !== expected) return false;
      if (operator === "*=" && !actual.includes(expected)) return false;
      if (operator === "^=" && !actual.startsWith(expected)) return false;
      if (operator === "$=" && !actual.endsWith(expected)) return false;
      if (operator === "~=" && !actual.split(/\s+/u).includes(expected)) return false;
    }
    return true;
  }

  class ElementMock {
    constructor(tagName = "div") {
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.ownerDocument = null;
      this.dataset = {};
      this.style = {
        setProperty(name, value) {
          this[name] = String(value);
        },
        removeProperty(name) {
          delete this[name];
        },
      };
      this.className = "";
      this.id = "";
      this.hidden = false;
      this.disabled = false;
      this._value = "";
      this.type = "";
      this.title = "";
      this._text = "";
      this._connected = false;
      this._everConnected = false;
      this._attributes = new Map();
      this._events = makeEventHub();
      allElements.add(this);
    }
    get isConnected() {
      return this._connected;
    }
    _trackDetachedAccess(operation) {
      if (this._everConnected && !this._connected) {
        effects.detachedDomAccesses.push({
          operation,
          tagName: this.tagName,
          className: this.className,
        });
      }
    }
    get value() {
      this._trackDetachedAccess("value:get");
      return this._value;
    }
    set value(next) {
      this._trackDetachedAccess("value:set");
      this._value = String(next ?? "");
    }
    get parentNode() {
      return this.parentElement;
    }
    get childNodes() {
      return this.children;
    }
    get nextSibling() {
      if (!this.parentElement) return null;
      const index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index + 1] || null;
    }
    get classList() {
      const element = this;
      return {
        contains(name) {
          return element.className.split(/\s+/u).filter(Boolean).includes(String(name));
        },
        add(...names) {
          const values = new Set(element.className.split(/\s+/u).filter(Boolean));
          names.forEach((name) => values.add(String(name)));
          element.className = [...values].join(" ");
        },
        remove(...names) {
          const removed = new Set(names.map(String));
          element.className = element.className
            .split(/\s+/u)
            .filter((name) => name && !removed.has(name))
            .join(" ");
        },
      };
    }
    get textContent() {
      this._trackDetachedAccess("textContent:get");
      if (this.children.length) return this.children.map((child) => child.textContent).join("");
      return this._text;
    }
    set textContent(value) {
      this._trackDetachedAccess("textContent:set");
      this._disconnectChildren();
      this.children = [];
      this._text = String(value ?? "");
    }
    get innerText() {
      if (
        this.hidden ||
        this.getAttribute("aria-hidden") === "true" ||
        this.getAttribute("data-h2o-title-native-hidden") === "1" ||
        this.style.display === "none" ||
        this.style.visibility === "hidden"
      ) return "";
      if (this.children.length) return this.children.map((child) => child.innerText).join("");
      return this._text;
    }
    set innerText(value) {
      this.textContent = value;
    }
    get innerHTML() {
      this._trackDetachedAccess("innerHTML:get");
      return this.textContent;
    }
    set innerHTML(value) {
      this._trackDetachedAccess("innerHTML:set");
      this._disconnectChildren();
      this.children = [];
      this._text = String(value || "");
    }
    _disconnectChildren() {
      for (const child of this.children) child._setConnected(false);
    }
    _setConnected(value) {
      this._connected = !!value;
      if (this._connected) this._everConnected = true;
      for (const child of this.children) child._setConnected(this._connected);
    }
    appendChild(child) {
      if (!child) return child;
      child.remove();
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument || documentRef;
      this.children.push(child);
      child._setConnected(this.isConnected);
      return child;
    }
    append(...nodes) {
      nodes.forEach((node) => this.appendChild(node));
    }
    prepend(...nodes) {
      [...nodes].reverse().forEach((node) => {
        node.remove();
        node.parentElement = this;
        node.ownerDocument = this.ownerDocument || documentRef;
        this.children.unshift(node);
        node._setConnected(this.isConnected);
      });
    }
    insertBefore(child, reference) {
      if (!reference || !this.children.includes(reference)) return this.appendChild(child);
      child.remove();
      const index = this.children.indexOf(reference);
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument || documentRef;
      this.children.splice(index, 0, child);
      child._setConnected(this.isConnected);
      return child;
    }
    insertAdjacentElement(position, child) {
      if (position !== "afterend" || !this.parentElement) return null;
      this.parentElement.insertBefore(child, this.nextSibling);
      return child;
    }
    remove() {
      if (this.parentElement) {
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
      }
      this.parentElement = null;
      this._setConnected(false);
    }
    setAttribute(name, value) {
      this._trackDetachedAccess("setAttribute");
      const key = String(name);
      const text = String(value);
      this._attributes.set(key, text);
      if (key === "id") this.id = text;
      if (key === "class") this.className = text;
      if (key.startsWith("data-")) {
        const dataName = key.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
        this.dataset[dataName] = text;
      }
    }
    getAttribute(name) {
      this._trackDetachedAccess("getAttribute");
      const key = String(name);
      if (key === "id" && this.id) return this.id;
      if (key === "class" && this.className) return this.className;
      return this._attributes.has(key) ? this._attributes.get(key) : null;
    }
    removeAttribute(name) {
      const key = String(name);
      this._attributes.delete(key);
      if (key.startsWith("data-")) {
        const dataName = key.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
        delete this.dataset[dataName];
      }
    }
    hasAttribute(name) {
      const key = String(name);
      if (key === "id") return !!this.id;
      if (key === "class") return !!this.className;
      return this._attributes.has(key);
    }
    addEventListener(name, handler) {
      this._trackDetachedAccess("addEventListener");
      this._events.addEventListener(name, handler);
    }
    removeEventListener(name, handler) {
      this._trackDetachedAccess("removeEventListener");
      this._events.removeEventListener(name, handler);
    }
    dispatchEvent(event) {
      const next = event?.type ? event : makeDomEvent(String(event || ""));
      this._events.dispatchEvent(next);
      return !next.defaultPrevented;
    }
    click() {
      this.dispatchEvent(makeDomEvent("click"));
    }
    focus() {
      if (documentRef) documentRef.activeElement = this;
    }
    select() {}
    contains(node) {
      if (node === this) return true;
      return this.children.some((child) => child.contains(node));
    }
    matches(selector) {
      return String(selector || "").split(",").some((item) => selectorMatches(this, item.trim()));
    }
    querySelectorAll(selector) {
      this._trackDetachedAccess("querySelectorAll");
      const selectors = String(selector || "").split(",").map((item) => item.trim()).filter(Boolean);
      const matches = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (selectors.some((item) => selectorMatches(child, item))) matches.push(child);
          visit(child);
        }
      };
      visit(this);
      return matches;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector) {
      let node = this;
      while (node) {
        if (String(selector).split(",").some((item) => selectorMatches(node, item.trim()))) return node;
        node = node.parentElement;
      }
      return null;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 320, bottom: 40, width: 320, height: 40 };
    }
    getClientRects() {
      return this.isConnected && this.innerText !== "" ? [this.getBoundingClientRect()] : [];
    }
  }

  class MutationObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      effects.observers.add(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }

  const html = new ElementMock("html");
  const head = new ElementMock("head");
  const body = new ElementMock("body");
  const composerParent = new ElementMock("div");
  const form = new ElementMock("form");
  form.setAttribute("data-testid", "composer");
  html._setConnected(true);
  html.appendChild(head);
  html.appendChild(body);
  body.appendChild(composerParent);
  composerParent.appendChild(form);

  const document = {
    ...documentEvents,
    readyState: "complete",
    hidden: false,
    title: "Initial title - ChatGPT",
    activeElement: null,
    documentElement: html,
    head,
    body,
    createElement(tagName) {
      const element = new ElementMock(tagName);
      element.ownerDocument = document;
      return element;
    },
    getElementById(id) {
      return [...allElements].find((element) => element.id === id && element.isConnected) || null;
    },
    querySelector(selector) {
      const value = String(selector || "");
      if (value === 'form[data-testid="composer"]' || value === "form") return form;
      if (value.startsWith('main div.text-token-text-secondary')) return null;
      return html.querySelector(value);
    },
    querySelectorAll(selector) {
      return html.querySelectorAll(selector);
    },
    createTreeWalker(root, _whatToShow, filter) {
      const nodes = [];
      const collect = (element) => {
        if (element.children.length === 0 && element._text) {
          nodes.push({
            nodeType: 3,
            nodeValue: element._text,
            parentElement: element,
          });
        }
        for (const child of element.children) collect(child);
      };
      collect(root);
      let index = -1;
      return {
        currentNode: null,
        nextNode() {
          while (++index < nodes.length) {
            const node = nodes[index];
            const verdict = filter?.acceptNode?.(node);
            if (verdict === 2) continue;
            this.currentNode = node;
            return node;
          }
          this.currentNode = null;
          return null;
        },
      };
    },
  };
  documentRef = document;
  html.ownerDocument = document;
  head.ownerDocument = document;
  body.ownerDocument = document;
  composerParent.ownerDocument = document;
  form.ownerDocument = document;

  return {
    document,
    ElementMock,
    MutationObserverMock,
    composerParent,
    form,
    triggerObservers() {
      for (const observer of effects.observers) {
        if (observer.active) observer.callback([]);
      }
    },
    activeObserverCount() {
      return [...effects.observers].filter((observer) => observer.active).length;
    },
  };
}

function createEditorHarness(initialState = {}) {
  const effects = makeEffects();
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const dom = createMiniDom(effects);
  const subscribers = new Set();
  const renameCalls = [];
  let confirmedUpdates = 0;
  let renameHandler = null;
  let state = {
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 1,
    baseTitle: "Initial title",
    emoji: "",
    displayTitle: "Initial title",
    documentTitle: "Initial title",
    convergence: { enabled: true, mode: "canonical" },
    ...initialState,
  };
  const location = {
    pathname: `/c/${state.chatId}`,
    href: `https://chatgpt.com/c/${state.chatId}`,
    origin: "https://chatgpt.com",
    search: "",
  };
  const api = {
    subscribe(callback) {
      subscribers.add(callback);
      callback({ ...state });
      return () => subscribers.delete(callback);
    },
    getState() {
      return { ...state };
    },
    refresh() {
      return { ...state };
    },
    async renameNative(value, options) {
      renameCalls.push({ value, options });
      let result = renameHandler
        ? await renameHandler(value, options)
        : { ok: true, status: "backend-submitted", baseTitle: sanitizeNativeTitle(value), emoji: "" };
      if (options?.signal?.aborted) {
        return { ok: false, status: "aborted", confirm: false };
      }
      if (result?.ok && result.confirm !== false) {
        const base = typeof result.baseTitle === "string" ? result.baseTitle : sanitizeNativeTitle(value);
        const emoji = typeof result.emoji === "string" ? result.emoji : state.emoji;
        const formatted = formatNativeDisplayTitle(base, emoji);
        state = {
          ...state,
          baseTitle: base,
          emoji,
          displayTitle: formatted.text,
          documentTitle: formatted.text,
        };
        confirmedUpdates += 1;
        for (const callback of [...subscribers]) callback({ ...state });
      }
      return result;
    },
  };
  class CustomEventMock {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  class MouseEventMock {
    constructor(type, options = {}) {
      Object.assign(this, makeDomEvent(type, options));
    }
  }
  const history = {
    pushState() {},
    replaceState() {},
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document: dom.document,
    location,
    history,
    H2O: { ChatTitle: api },
    console: { log() {}, warn() {}, error() {} },
    CustomEvent: CustomEventMock,
    MouseEvent: MouseEventMock,
    MutationObserver: dom.MutationObserverMock,
    AbortController,
    HTMLElement: dom.ElementMock,
    Element: dom.ElementMock,
    URL,
    URLSearchParams,
    Intl,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    },
    innerWidth: 1280,
    innerHeight: 800,
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const script = new vm.Script(c1Source, { filename: `${C1_REL}:stage1e-editor-harness` });

  function emit(nextState) {
    state = { ...state, ...nextState };
    for (const callback of [...subscribers]) callback({ ...state });
  }

  return {
    sandbox,
    document: dom.document,
    effects,
    api,
    evaluate() {
      script.runInContext(context);
    },
    emit,
    state() {
      return { ...state };
    },
    setRoute(pathname) {
      location.pathname = pathname;
      location.href = `https://chatgpt.com${pathname}`;
    },
    setRenameHandler(handler) {
      renameHandler = handler;
    },
    renameCalls,
    confirmedUpdates() {
      return confirmedUpdates;
    },
    subscriberCount() {
      return subscribers.size;
    },
    listenerCount() {
      return windowEvents.count();
    },
    activeObserverCount: dom.activeObserverCount,
    find(selector) {
      return dom.document.querySelector(selector);
    },
    openEditor() {
      const title = dom.document.querySelector(".ho-title-text");
      assert(title, "confirmed title element missing");
      title.dispatchEvent(makeDomEvent("dblclick"));
      const input = dom.document.querySelector(".ho-title-edit-input");
      assert(input, "editor input missing");
      return input;
    },
    key(input, key) {
      input.dispatchEvent(makeDomEvent("keydown", { key }));
    },
    blur(input) {
      input.dispatchEvent(makeDomEvent("blur"));
    },
    destroy() {
      for (const key of ["__h2oTitleUnderInputRuntime_v3", "__h2oTitleUnderInputRuntime_v4"]) {
        sandbox[key]?.destroy?.();
      }
    },
  };
}

function createSidebarHarness(initialState = {}) {
  const effects = makeEffects();
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const dom = createMiniDom(effects);
  const subscribers = new Set();
  const mutations = { canonical: 0, patches: 0, storeWrites: 0 };
  const routePath = typeof initialState.routePath === "string"
    ? initialState.routePath
    : `/c/${initialState.chatId || "stage1eb-chat-a"}`;
  const { routePath: _ignoredRoutePath, ...snapshotState } = initialState;
  let state = {
    chatId: "stage1eb-chat-a",
    routeKind: "chat",
    routeToken: 1,
    baseTitle: "Native clean",
    emoji: "",
    displayTitle: "Native clean",
    documentTitle: "Native clean",
    convergence: { enabled: true, mode: "canonical" },
    ...snapshotState,
  };
  const location = {
    pathname: routePath,
    href: `https://chatgpt.com${routePath}`,
    origin: "https://chatgpt.com",
    search: "",
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document: dom.document,
    location,
    history: { pushState() {}, replaceState() {} },
    localStorage: makeStorage(effects),
    sessionStorage: makeStorage(effects),
    console: { log() {}, warn() {}, error() {} },
    HTMLElement: dom.ElementMock,
    MutationObserver: dom.MutationObserverMock,
    URL,
    decodeURIComponent,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
    getComputedStyle(element) {
      return {
        display: element?.style?.display || "block",
        visibility: element?.style?.visibility || "visible",
        opacity: element?.style?.opacity ?? "1",
      };
    },
    fetch() {
      mutations.patches += 1;
      throw new Error("9B2a attempted network access");
    },
  };
  sandbox.window = sandbox;
  sandbox.H2O = {
    ChatTitle: {
      subscribe(callback) {
        subscribers.add(callback);
        callback({ ...state, convergence: { ...state.convergence } });
        return () => subscribers.delete(callback);
      },
      setTitle() { mutations.canonical += 1; },
      setEmoji() { mutations.canonical += 1; },
      renameNative() { mutations.patches += 1; },
    },
    Library: {
      Store: {
        set() { mutations.storeWrites += 1; },
      },
    },
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(b2Source, { filename: `${B2_REL}:stage1eb-harness` });
  let defaultContainer = null;

  function ensureContainer(tagName = "nav", parent = dom.document.body) {
    const container = dom.document.createElement(tagName);
    parent.appendChild(container);
    if (!defaultContainer && tagName === "nav") defaultContainer = container;
    return container;
  }

  function createRow(options = {}) {
    const container = options.container || defaultContainer || ensureContainer();
    const anchor = dom.document.createElement("a");
    anchor.className = "__menu-item";
    anchor.setAttribute("href", options.href || location.pathname);
    if (Object.prototype.hasOwnProperty.call(options, "ariaLabelledby")) {
      anchor.setAttribute("aria-labelledby", options.ariaLabelledby);
    }
    if (Object.prototype.hasOwnProperty.call(options, "ariaLabel")) {
      anchor.setAttribute("aria-label", options.ariaLabel);
    }
    if (Object.prototype.hasOwnProperty.call(options, "title")) {
      anchor.setAttribute("title", options.title);
    }
    if (options.hidden) anchor.setAttribute("hidden", "");
    const layout = dom.document.createElement("div");
    anchor.appendChild(layout);
    let source = null;
    if (options.nativeTitle !== null) {
      source = dom.document.createElement("span");
      source.className = options.nativeClass || "truncate";
      source.textContent = options.nativeTitle ?? "Native clean";
      layout.appendChild(source);
    }
    container.appendChild(anchor);
    return { container, anchor, layout, source };
  }

  function runTimers(kind) {
    for (const [id, timer] of [...effects.timers]) {
      if (kind && timer.kind !== kind) continue;
      effects.timers.delete(id);
      timer.callback();
    }
  }

  return {
    sandbox,
    effects,
    mutations,
    dom,
    evaluate() { script.runInContext(context); },
    ensureContainer,
    createRow,
    emit(next) {
      state = {
        ...state,
        ...next,
        convergence: { ...state.convergence, ...(next?.convergence || {}) },
      };
      for (const callback of [...subscribers]) {
        callback({ ...state, convergence: { ...state.convergence } });
      }
    },
    setLocation(pathname) {
      location.pathname = pathname;
      location.href = `https://chatgpt.com${pathname}`;
    },
    runFrames() { runTimers("frame"); },
    runRetries() { runTimers("timeout"); },
    triggerMutation(records = []) {
      for (const item of effects.observers) {
        if (item.active) item.callback(records);
      }
    },
    visual(row) {
      return row.anchor.querySelector(
        '[data-h2o-owner="title-sidebar-renderer"][data-h2o-title-role="visual"]',
      );
    },
    nativeText(row) { return row.source?.textContent ?? ""; },
    renderedText(row) { return row.anchor.innerText; },
    subscriptionCount() { return subscribers.size; },
    observerCount() {
      return [...effects.observers].filter((item) => item.active).length;
    },
    runtime() { return sandbox.H2O.SidebarTitleRenderer; },
    destroy() { sandbox.H2O.SidebarTitleRenderer?.destroy?.(); },
  };
}

function executeReaderSlice(key, globals, expression) {
  return executeReaderBundle([key], globals, expression);
}

function executeReaderBundle(keys, globals, expression) {
  const sandbox = { ...globals };
  const context = vm.createContext(sandbox);
  new vm.Script(
    `${keys.map((key) => readerSlices[key]).join("\n")}\nglobalThis.__stage1ebReaderResult = (${expression});`,
    { filename: `${keys.join("+")}:committed-reader-slice` },
  ).runInContext(context);
  return sandbox.__stage1ebReaderResult;
}

function chooseBetterLibraryTitle(previous, next, fallback = "") {
  return executeReaderBundle(
    ["f0dEnsureString", "f0dNormText", "f0dChooseBetterTitle"],
    { previous, next, fallback },
    "chooseBetterTitle(previous, next, fallback)",
  );
}

function runReaderSlices(harness, row) {
  const { dom } = harness;
  const normText = (raw) => String(raw || "").replace(/\s+/gu, " ").trim();
  const parseChatId = (href) => {
    try {
      const match = new URL(String(href || ""), "https://chatgpt.com").pathname.match(/^\/c\/([^/]+)$/u);
      return match ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  };
  const chatId = parseChatId(row.anchor.getAttribute("href"));
  const common = {
    anchor: row.anchor,
    HTMLElement: dom.ElementMock,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    D: dom.document,
    SEL: {
      sidebarTruncate: '.truncate,[class*="truncate"]',
      sidebarItemAnchor: 'a[href*="/c/"]',
    },
  };
  const f1cNative = executeReaderSlice("f1cNative", {
    ...common,
    chatId,
    normText,
  }, "extractNativeRecentTitle(anchor, chatId)");
  const f2aNative = executeReaderSlice("f2aNative", {
    ...common,
    root: row.container,
    DOM_collectNativeProjectAnchors: () => [row.anchor],
    PROJECTS_idFromHref: () => "reader-project",
    normText,
  }, "DOM_collectNativeProjectRows(root)[0]?.title || ''");
  const f3aNative = executeReaderSlice("f3aNative", {
    ...common,
    UTIL_normText: normText,
    UI_cleanSurfaceChatTitle: normText,
    UI_isNoisySurfaceChatTitle: () => false,
  }, "DOM_extractSidebarChatTitle(anchor, '')");
  const f3aRendered = executeReaderSlice("f3aRendered", {
    ...common,
    source: "stage1eb",
    UTIL_normText: normText,
    DOM_parseChatIdFromHref: parseChatId,
    DOM_findChatTitleInSidebarByHref: () => "",
    DOM_rectSnapshot: () => null,
  }, "DOM_menuContextFromAnchor(anchor, source)?.title || ''");
  const f6aRendered = executeReaderBundle(
    ["f6aSelectors", "f6aNormText", "f6aIds", "f6aRendered"],
    {
    ...common,
    chatId,
  }, "findChatTitleInSidebar(chatId)");
  const f6aTruncate = executeReaderBundle(["f6aSelectors", "f6aSetRowText"], {
    ...common,
    row: row.anchor,
    visual: harness.visual(row),
    nativeTitle: row.source?.textContent || "",
  }, `(() => {
    setRowText(row, nativeTitle);
    const selected = row.querySelector(SEL.sidebarTruncate);
    return { text: selected?.textContent || "", matchedVisual: selected === visual };
  })()`);
  const d3aRendered = executeReaderSlice("d3aRendered", {
    ...common,
    chatId,
    toChatId: (value) => String(value || ""),
    normalizeChatIdFromUrl: parseChatId,
  }, "readSidebarConversationTitle(chatId)");
  return {
    f1cNative,
    f2aNative,
    f3aNative,
    f6aTruncateTarget: f6aTruncate.text,
    f6aTruncateMatchedVisual: f6aTruncate.matchedVisual,
    f6aVisualAfterTruncateTarget: harness.visual(row)?.textContent || "",
    f3aRendered,
    f6aRendered,
    d3aRendered,
  };
}

function currentRecord(harness) {
  return JSON.parse(JSON.stringify(harness.hook.currentRecord()));
}

function recordFor(harness, chatId) {
  const value = harness.hook.recordFor(chatId);
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function patchBody(effects) {
  const entry = effects.fetches.find((item) => item.options?.method === "PATCH");
  return entry ? JSON.parse(entry.options.body) : null;
}

await scenario("default flag state preserves the legacy formatter path", () => {
  const harness = createB0Harness();
  // internal separators are ordinary content in both modes
  assert.equal(harness.hook.displayFrom("Alpha - Beta", "✨"), "✨ Alpha - Beta");
  // legacy still differs from canonical where the contract intends it to
  assert.equal(harness.hook.displayFrom("ChatGPT", "✨"), "✨");
  harness.api.debug.refreshDisplay("default-legacy");
  assert.equal(harness.api.getState().convergence.mode, "legacy");
  assert.equal(harness.api.getState().convergence.enabled, false);
});

await scenario("explicit flag activation selects the canonical formatter path", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Alpha - Beta", "✨"), "✨ Alpha - Beta");
  // canonical keeps a bare "ChatGPT" as valid content; legacy rejects it
  assert.equal(harness.hook.displayFrom("ChatGPT", "✨"), "✨ ChatGPT");
  harness.api.debug.refreshDisplay("canonical-on");
  assert.equal(harness.api.getState().convergence.mode, "canonical");
  assert.equal(harness.api.getState().convergence.enabled, true);
});

await scenario("invalid or missing bridge identity falls back to legacy", () => {
  const invalid = createB0Harness({ flag: true, bridge: "invalid" });
  assert.equal(invalid.hook.displayFrom("Alpha - Beta", "✨"), "✨ Alpha - Beta");
  assert.equal(invalid.hook.displayFrom("ChatGPT", "✨"), "✨");
  invalid.api.debug.refreshDisplay("invalid-bridge");
  assert.equal(invalid.api.getState().convergence.mode, "legacy-fallback");
  assert.match(invalid.api.getState().lastWarning, /contract gate identity-mismatch/u);

  const absent = createB0Harness({ flag: true, bridge: "absent" });
  assert.equal(absent.hook.displayFrom("Alpha - Beta", "✨"), "✨ Alpha - Beta");
  assert.equal(absent.hook.displayFrom("ChatGPT", "✨"), "✨");
});

await scenario("ordinary LTR title uses canonical composition", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Ordinary title", "✨"), "✨ Ordinary title");
});

await scenario("internal dash remains intact under canonical formatting", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Design - implementation", ""), "Design - implementation");
});

await scenario("terminal ChatGPT suffix is handled exactly once", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Release plan - ChatGPT", ""), "Release plan");
  assert.equal(harness.hook.displayFrom("ChatGPT", ""), "ChatGPT");
});

await scenario("existing edge emoji is not duplicated", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("✨ Existing", "✨"), "✨ Existing");
  assert.equal(harness.hook.displayFrom("Existing ✨", "✨"), "✨ Existing");
});

await scenario("multi-code-point emoji remains intact", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Developer notes", "👩🏽‍💻"), "👩🏽‍💻 Developer notes");
});

await scenario("Arabic title uses deterministic RTL composition", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("مرحبا بالعالم", "✨"), "مرحبا بالعالم ✨");
});

await scenario("Hebrew title uses deterministic RTL composition", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("כותרת בדיקה", "✨"), "כותרת בדיקה ✨");
});

await scenario("successful rename does not change canonical state before PATCH success", async () => {
  const harness = createB0Harness({ flag: true });
  const pendingPatch = deferred();
  harness.setFetch(async (url) => (
    url === "/api/auth/session"
      ? response({ body: { accessToken: "token" } })
      : pendingPatch.promise
  ));
  const before = currentRecord(harness);
  const rename = harness.api.renameNative("Accepted - ChatGPT", {
    userInitiated: true,
    source: "validator",
  });
  await flushMicrotasks();
  assert.deepEqual(currentRecord(harness), before);
  assert.equal(harness.effects.storageOps.length, 0);
  pendingPatch.resolve(response());
  const result = await rename;
  assert.equal(result.ok, true);
});

await scenario("successful rename produces exactly one confirmed canonical update", async () => {
  const harness = createB0Harness({ flag: true });
  let updates = 0;
  harness.api.subscribe(() => {
    updates += 1;
  });
  updates = 0;
  harness.effects.resetTransient();
  const before = currentRecord(harness);
  const result = await harness.api.renameNative("Confirmed title", {
    userInitiated: true,
    source: "validator",
  });
  const after = currentRecord(harness);
  assert.equal(result.ok, true);
  assert.equal(after.baseTitle, "Confirmed title");
  assert.equal(after.rev, before.rev + 1);
  assert.equal(updates, 1);
  assert.deepEqual(patchBody(harness.effects), { title: "Confirmed title" });
  assert.equal(harness.effects.storageOps.filter((entry) => entry.type === "set").length, 1);
});

await scenario("failed rename leaves canonical state and persistence unchanged", async () => {
  const harness = createB0Harness({ flag: true });
  harness.setFetch(async (url) => (
    url === "/api/auth/session"
      ? response({ body: {} })
      : response({ ok: false, status: 500, body: { error: "expected" } })
  ));
  const before = currentRecord(harness);
  const storageBefore = harness.storage.snapshot();
  const result = await harness.api.renameNative("Rejected title", {
    userInitiated: true,
    source: "validator",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(currentRecord(harness), before);
  assert.equal(harness.storage.snapshot(), storageBefore);
  assert.equal(harness.effects.storageOps.length, 0);
});

await scenario("superseded or stale-route completion cannot update canonical state", async () => {
  const superseded = createB0Harness({ flag: true });
  const firstPatch = deferred();
  const secondPatch = deferred();
  superseded.setFetch(async (url, options) => {
    if (url === "/api/auth/session") return response({ body: {} });
    const title = JSON.parse(options.body).title;
    return title === "First title" ? firstPatch.promise : secondPatch.promise;
  });
  const before = currentRecord(superseded);
  const first = superseded.api.renameNative("First title", { userInitiated: true, source: "validator" });
  await flushMicrotasks();
  const second = superseded.api.renameNative("Second title", { userInitiated: true, source: "validator" });
  await flushMicrotasks();
  firstPatch.resolve(response());
  const firstResult = await first;
  assert.equal(firstResult.status, "superseded");
  assert.deepEqual(currentRecord(superseded), before);
  secondPatch.resolve(response());
  const secondResult = await second;
  assert.equal(secondResult.ok, true);
  assert.equal(currentRecord(superseded).baseTitle, "Second title");

  const stale = createB0Harness({ flag: true });
  const stalePatch = deferred();
  stale.setFetch(async (url) => (
    url === "/api/auth/session" ? response({ body: {} }) : stalePatch.promise
  ));
  const oldChatId = stale.api.getState().chatId;
  const oldRecord = recordFor(stale, oldChatId);
  const staleRename = stale.api.renameNative("Stale title", { userInitiated: true, source: "validator" });
  await flushMicrotasks();
  stale.setRoute("/c/stage1e-chat-b");
  stale.setDocumentTitle("Route B - ChatGPT");
  stale.effects.resetTransient();
  stalePatch.resolve(response());
  const staleResult = await staleRename;
  assert.equal(staleResult.status, "route-stale");
  assert.deepEqual(recordFor(stale, oldChatId), oldRecord);
  assert.equal(stale.effects.storageOps.length, 0);

  const authPending = createB0Harness({ flag: true });
  const authResponse = deferred();
  authPending.setFetch(async (url) => (
    url === "/api/auth/session" ? authResponse.promise : response()
  ));
  const authOldChatId = authPending.api.getState().chatId;
  const authOldRecord = recordFor(authPending, authOldChatId);
  const authRename = authPending.api.renameNative("Auth-stale title", {
    userInitiated: true,
    source: "validator",
  });
  await flushMicrotasks();
  authPending.setRoute("/c/stage1e-chat-b");
  authResponse.resolve(response({ body: { accessToken: "stage1e-token" } }));
  const authResult = await authRename;
  assert.equal(authResult.status, "route-stale");
  assert.equal(
    authPending.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length,
    0,
  );
  assert.deepEqual(recordFor(authPending, authOldChatId), authOldRecord);
});

await scenario("explicit chat mismatch fails before authentication or PATCH", async () => {
  const harness = createB0Harness({ flag: true });
  const before = currentRecord(harness);
  const result = await harness.api.renameNative("Wrong target", {
    userInitiated: true,
    source: "validator",
    chatId: "stage1e-chat-b",
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "wrong-chat",
  });
  assert.equal(result.reason, "route-stale-before-request");
  assert.equal(harness.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(harness), before);
  assert.equal(harness.effects.storageOps.length, 0);
});

await scenario("explicit route-token mismatch fails before authentication or PATCH", async () => {
  const harness = createB0Harness({ flag: true });
  const before = currentRecord(harness);
  const result = await harness.api.renameNative("Wrong token", {
    userInitiated: true,
    source: "validator",
    chatId: harness.api.getState().chatId,
    expectedRouteToken: harness.api.getState().routeToken + 1,
    expectedRouteKind: "chat",
    operationId: "wrong-token",
  });
  assert.equal(result.reason, "route-stale-before-request");
  assert.equal(harness.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(harness), before);
});

await scenario("URL and coordinator mismatch fails before authentication or PATCH", async () => {
  const harness = createB0Harness({ flag: true });
  const before = currentRecord(harness);
  harness.setRoute("/c/stage1e-chat-b");
  const result = await harness.api.renameNative("URL moved", {
    userInitiated: true,
    source: "validator",
    chatId: "stage1e-chat-a",
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "url-moved",
  });
  assert.equal(result.reason, "route-stale-before-request");
  assert.equal(harness.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(harness), before);
});

await scenario("native PATCH receives clean base while canonical emoji remains separate", async () => {
  for (const sample of [
    { input: "✨ New title", patch: "New title", emoji: "✨", display: "✨ New title" },
    { input: "✨✨ Repeated", patch: "Repeated", emoji: "✨", display: "✨ Repeated" },
    { input: "👩🏽‍💻 Developer", patch: "Developer", emoji: "👩🏽‍💻", display: "👩🏽‍💻 Developer" },
    { input: "مرحبا ✨", patch: "مرحبا", emoji: "✨", display: "مرحبا ✨" },
    { input: "✨ Release - ChatGPT", patch: "Release", emoji: "✨", display: "✨ Release" },
  ]) {
    const harness = createB0Harness({ flag: true });
    const result = await harness.api.renameNative(sample.input, {
      userInitiated: true,
      source: "validator",
      chatId: harness.api.getState().chatId,
      expectedRouteToken: harness.api.getState().routeToken,
      expectedRouteKind: "chat",
      operationId: `emoji-${sample.patch}`,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(patchBody(harness.effects), { title: sample.patch });
    assert.equal(harness.api.getState().baseTitle, sample.patch);
    assert.equal(harness.api.getState().emoji, sample.emoji);
    assert.equal(harness.api.getState().displayTitle, sample.display);
  }

  const empty = createB0Harness({ flag: true });
  const emptyResult = await empty.api.renameNative("✨", {
    userInitiated: true,
    source: "validator",
    chatId: empty.api.getState().chatId,
    expectedRouteToken: empty.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "emoji-only",
  });
  assert.equal(emptyResult.reason, "empty-base-after-emoji");
  assert.equal(empty.effects.fetches.length, 0);
});

await scenario("existing emoji is preserved and submitted emoji replaces it after confirmation", async () => {
  const harness = createB0Harness({ flag: true });
  harness.api.setEmoji({
    chatId: harness.api.getState().chatId,
    emoji: "🚀",
    source: "user",
    priority: 100,
  }, { force: true, reason: "validator-seed" });
  harness.effects.resetTransient();
  await harness.api.renameNative("Plain replacement", {
    userInitiated: true,
    source: "validator",
    chatId: harness.api.getState().chatId,
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "preserve-existing-emoji",
  });
  assert.deepEqual(patchBody(harness.effects), { title: "Plain replacement" });
  assert.equal(harness.api.getState().emoji, "🚀");

  harness.effects.resetTransient();
  await harness.api.renameNative("✨ Explicit replacement", {
    userInitiated: true,
    source: "validator",
    chatId: harness.api.getState().chatId,
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "replace-existing-emoji",
  });
  assert.deepEqual(patchBody(harness.effects), { title: "Explicit replacement" });
  assert.equal(harness.api.getState().emoji, "✨");
});

await scenario("abort and destruction during a pending request remain non-mutating", async () => {
  const aborted = createB0Harness({ flag: true });
  const externalController = new AbortController();
  externalController.abort();
  const beforeAbort = currentRecord(aborted);
  const abortResult = await aborted.api.renameNative("Never requested", {
    userInitiated: true,
    source: "validator",
    chatId: aborted.api.getState().chatId,
    expectedRouteToken: aborted.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "aborted-before-request",
    signal: externalController.signal,
  });
  assert.equal(abortResult.reason, "aborted-before-request");
  assert.equal(aborted.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(aborted), beforeAbort);

  const destroyedHarness = createB0Harness({ flag: true });
  const pendingPatch = deferred();
  destroyedHarness.setFetch(async (url) => (
    url === "/api/auth/session" ? response({ body: {} }) : pendingPatch.promise
  ));
  const beforeDestroy = currentRecord(destroyedHarness);
  const pendingRename = destroyedHarness.api.renameNative("Destroyed request", {
    userInitiated: true,
    source: "validator",
    chatId: destroyedHarness.api.getState().chatId,
    expectedRouteToken: destroyedHarness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "destroyed-pending",
  });
  await flushMicrotasks();
  destroyedHarness.hook.destroy();
  pendingPatch.resolve(response());
  const destroyedResult = await pendingRename;
  assert.equal(destroyedResult.status, "destroyed");
  assert.deepEqual(currentRecord(destroyedHarness), beforeDestroy);
  assert.equal(destroyedHarness.effects.storageOps.length, 0);
});

await scenario("editor opened on Chat A then routed to Chat B rejects Enter before rename", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Chat A pending";
  harness.setRoute("/c/stage1e-chat-b");
  harness.emit({
    chatId: "stage1e-chat-b",
    routeToken: 2,
    baseTitle: "Chat B",
    displayTitle: "Chat B",
    documentTitle: "Chat B",
  });
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
  assert.equal(harness.state().baseTitle, "Chat B");
});

await scenario("editor opened on Chat A then routed to Chat B rejects blur before rename", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Chat A pending";
  harness.setRoute("/c/stage1e-chat-b");
  harness.emit({
    chatId: "stage1e-chat-b",
    routeToken: 2,
    baseTitle: "Chat B",
    displayTitle: "Chat B",
    documentTitle: "Chat B",
  });
  harness.blur(input);
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
});

await scenario("URL change before coordinator refresh rejects editor submission", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Must stay with Chat A";
  harness.setRoute("/c/stage1e-chat-b");
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
  assert.equal(harness.confirmedUpdates(), 0);
});

await scenario("successful editor save performs one rename and one confirmed update", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Confirmed editor title";
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 1);
  assert.equal(harness.confirmedUpdates(), 1);
  assert.equal(harness.state().baseTitle, "Confirmed editor title");
  assert.equal(harness.find(".ho-title-text")?.textContent, "Confirmed editor title");
});

await scenario("failed editor save preserves canonical display and shows Retry", async () => {
  const harness = createEditorHarness();
  harness.setRenameHandler(async () => ({ ok: false, status: "backend-500", confirm: false }));
  harness.evaluate();
  const before = harness.state();
  const input = harness.openEditor();
  input.value = "Rejected editor title";
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.confirmedUpdates(), 0);
  assert.deepEqual(harness.state(), before);
  assert.equal(harness.find(".ho-title-text")?.textContent, before.displayTitle);
  assert(harness.find(".ho-title-rename-retry"), "Retry control missing");
});

await scenario("editor Retry uses the intended failed pending text", async () => {
  const harness = createEditorHarness();
  let attempt = 0;
  harness.setRenameHandler(async (value) => {
    attempt += 1;
    if (attempt === 1) return { ok: false, status: "backend-500", confirm: false };
    return { ok: true, status: "backend-submitted", baseTitle: value, emoji: "" };
  });
  harness.evaluate();
  const firstInput = harness.openEditor();
  firstInput.value = "Retry this exact title";
  harness.key(firstInput, "Enter");
  await flushMicrotasks(12);
  harness.find(".ho-title-rename-retry").click();
  const retryInput = harness.find(".ho-title-edit-input");
  assert.equal(retryInput.value, "Retry this exact title");
  harness.key(retryInput, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 2);
  assert.equal(harness.renameCalls[1].value, "Retry this exact title");
  assert.equal(harness.state().baseTitle, "Retry this exact title");
});

await scenario("Enter followed by blur submits the editor once", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "One submission";
  harness.key(input, "Enter");
  harness.blur(input);
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 1);
  assert.equal(harness.confirmedUpdates(), 1);
});

await scenario("Escape followed by blur submits nothing", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Do not submit";
  harness.key(input, "Escape");
  harness.blur(input);
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
  assert.equal(harness.state().baseTitle, "Initial title");
});

await scenario("editor reinstall supersedes an older pending submission", async () => {
  const harness = createEditorHarness();
  const firstPending = deferred();
  harness.setRenameHandler(async (value) => {
    if (value === "Older pending") return firstPending.promise;
    return { ok: true, status: "backend-submitted", baseTitle: value, emoji: "" };
  });
  harness.evaluate();
  const firstInput = harness.openEditor();
  firstInput.value = "Older pending";
  harness.key(firstInput, "Enter");
  await flushMicrotasks();

  harness.evaluate();
  const secondInput = harness.openEditor();
  secondInput.value = "Newer confirmed";
  harness.key(secondInput, "Enter");
  await flushMicrotasks(12);
  firstPending.resolve({ ok: true, status: "backend-submitted", baseTitle: "Older pending", emoji: "" });
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 2);
  assert.equal(harness.confirmedUpdates(), 1);
  assert.equal(harness.state().baseTitle, "Newer confirmed");
});

await scenario("pending editor rename then destroy has no late DOM access or confirmation", async () => {
  const harness = createEditorHarness();
  const pending = deferred();
  harness.setRenameHandler(async () => pending.promise);
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Destroyed pending";
  harness.key(input, "Enter");
  await flushMicrotasks();
  harness.destroy();
  pending.resolve({ ok: true, status: "backend-submitted", baseTitle: "Destroyed pending", emoji: "" });
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 1);
  assert.equal(harness.confirmedUpdates(), 0);
  assert.deepEqual(harness.effects.detachedDomAccesses, []);
  assert.equal(harness.find(".ho-tab-title-under-input"), null);
});

await scenario("pending editor rename then route removal is safely cancelled", async () => {
  const harness = createEditorHarness();
  const pending = deferred();
  harness.setRenameHandler(async () => pending.promise);
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Route removed";
  harness.key(input, "Enter");
  await flushMicrotasks();
  harness.setRoute("/");
  harness.emit({
    chatId: null,
    routeKind: "transient",
    routeToken: 2,
    baseTitle: "",
    displayTitle: "",
    documentTitle: "",
  });
  pending.resolve({ ok: true, status: "backend-submitted", baseTitle: "Route removed", emoji: "" });
  await flushMicrotasks(12);
  assert.equal(harness.confirmedUpdates(), 0);
  assert.deepEqual(harness.effects.detachedDomAccesses, []);
  assert.equal(harness.find(".ho-tab-title-under-input"), null);
  assert.equal(harness.find(".ho-title-rename-error"), null);
});

await scenario("editor destroy and reinstall leaves one listener subscription and observer set", () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const first = {
    subscribers: harness.subscriberCount(),
    listeners: harness.listenerCount(),
    observers: harness.activeObserverCount(),
  };
  harness.evaluate();
  const second = {
    subscribers: harness.subscriberCount(),
    listeners: harness.listenerCount(),
    observers: harness.activeObserverCount(),
  };
  assert.deepEqual(second, first);
  assert.equal(second.subscribers, 1);
  assert.equal(second.observers, 1);
});

await scenario("edge emoji editor intent produces an emoji-free native PATCH", async () => {
  const editor = createEditorHarness();
  editor.setRenameHandler(async () => ({
    ok: true,
    status: "backend-submitted",
    baseTitle: "New title",
    emoji: "✨",
  }));
  editor.evaluate();
  const input = editor.openEditor();
  input.value = "✨ New title";
  editor.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(editor.renameCalls[0].value, "✨ New title");
  assert.equal(editor.state().displayTitle, "✨ New title");

  const coordinator = createB0Harness({ flag: true });
  await coordinator.api.renameNative(editor.renameCalls[0].value, {
    ...editor.renameCalls[0].options,
    chatId: coordinator.api.getState().chatId,
    expectedRouteToken: coordinator.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "editor-edge-emoji",
    signal: undefined,
  });
  assert.deepEqual(patchBody(coordinator.effects), { title: "New title" });
});

await scenario("multi-code-point emoji editor intent remains separate from native base", async () => {
  const coordinator = createB0Harness({ flag: true });
  await coordinator.api.renameNative("👩🏽‍💻 Developer notes", {
    userInitiated: true,
    source: "under-input",
    chatId: coordinator.api.getState().chatId,
    expectedRouteToken: coordinator.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "editor-multi-emoji",
  });
  assert.deepEqual(patchBody(coordinator.effects), { title: "Developer notes" });
  assert.equal(coordinator.api.getState().emoji, "👩🏽‍💻");
  assert.equal(coordinator.api.getState().displayTitle, "👩🏽‍💻 Developer notes");
});

await scenario("RTL suffix emoji editor intent remains separate and deterministic", async () => {
  const coordinator = createB0Harness({ flag: true });
  await coordinator.api.renameNative("مرحبا بالعالم ✨", {
    userInitiated: true,
    source: "under-input",
    chatId: coordinator.api.getState().chatId,
    expectedRouteToken: coordinator.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "editor-rtl-emoji",
  });
  assert.deepEqual(patchBody(coordinator.effects), { title: "مرحبا بالعالم" });
  assert.equal(coordinator.api.getState().displayTitle, "مرحبا بالعالم ✨");
});

await scenario("canonical enabled under-input display is consumed byte-exactly", () => {
  const exact = "  Canonical   spacing  ";
  const harness = createEditorHarness({
    displayTitle: exact,
    documentTitle: exact,
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.find(".ho-title-text")?.textContent, exact);

  const emojiOnly = createEditorHarness({
    baseTitle: "",
    emoji: "👩🏽‍💻",
    displayTitle: "👩🏽‍💻",
    documentTitle: "👩🏽‍💻",
    convergence: { enabled: true, mode: "canonical" },
  });
  emojiOnly.evaluate();
  assert.equal(emojiOnly.find(".ho-title-text")?.textContent, "👩🏽‍💻");
});

await scenario("legacy disabled under-input display retains legacy normalization", () => {
  const harness = createEditorHarness({
    displayTitle: "  Legacy   spacing  ",
    documentTitle: "  Legacy   spacing  ",
    convergence: { enabled: false, mode: "legacy" },
  });
  harness.evaluate();
  assert.equal(harness.find(".ho-title-text")?.textContent, "Legacy spacing");
});

await scenario("browser-tab canonical path is byte-exact and self-write observer is bounded", () => {
  const exact = "  ✨ Canonical   exact  ";
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Wrong - fallback",
    displayTitle: exact,
    documentTitle: exact,
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.document.title, exact);
  assert.equal(harness.titleAssignments(), 1);
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, exact);
  assert.equal(harness.titleAssignments(), 1);
  assert(harness.titleWritesMarked() >= 1);
});

await scenario("browser-tab native overwrite is reasserted once and same-value sync is suppressed", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Base",
    displayTitle: "Canonical title",
    documentTitle: "Canonical title",
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.titleAssignments(), 1);
  harness.document.title = "Native overwrite - ChatGPT";
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, "Canonical title");
  assert.equal(harness.titleAssignments(), 3);
  harness.runTimers("interval");
  assert.equal(harness.titleAssignments(), 3);
});

await scenario("flag disable snapshot restores legacy browser-tab rendering", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Base",
    displayTitle: "Canonical",
    documentTitle: "Canonical",
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.document.title, "Canonical");
  harness.emit({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Legacy base",
    displayTitle: "",
    documentTitle: "Legacy document",
    convergence: { enabled: false, mode: "legacy" },
  });
  assert.equal(harness.document.title, "Legacy document");
});

await scenario("real central false true false flag changes reproject both consumers without title writes", () => {
  const harness = createB0Harness({ flag: false });
  const recordBefore = currentRecord(harness);
  const storageBefore = harness.storage.snapshot();
  const snapshots = [];
  let notifications = 0;
  harness.api.subscribe((state) => {
    notifications += 1;
    snapshots.push(state);
  });
  notifications = 0;
  snapshots.length = 0;
  harness.effects.resetTransient();
  assert.equal(harness.flagListenerCount(), 1);
  harness.setRuntimeFlag(true);
  assert.equal(harness.api.getState().convergence.enabled, true);
  harness.sandbox.dispatchEvent(new harness.sandbox.CustomEvent("evt:h2o:flags:changed", {
    detail: { name: FLAG_KEY, value: true, source: "compatibility-alias" },
  }));
  assert.equal(notifications, 1);
  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().convergence.enabled, false);
  assert.equal(notifications, 2);
  assert.deepEqual(currentRecord(harness), recordBefore);
  assert.equal(harness.storage.snapshot(), storageBefore);
  assert.equal(harness.effects.storageOps.length, 0);

  const canonicalSnapshot = snapshots[0];
  const legacySnapshot = snapshots[1];
  const tab = createTabHarness(legacySnapshot);
  tab.evaluate();
  tab.emit(canonicalSnapshot);
  assert.equal(tab.document.title, canonicalSnapshot.documentTitle);
  tab.emit(legacySnapshot);
  assert.equal(tab.document.title, legacySnapshot.documentTitle);

  const editor = createEditorHarness(legacySnapshot);
  editor.evaluate();
  editor.emit(canonicalSnapshot);
  assert.equal(editor.find(".ho-title-text")?.textContent, canonicalSnapshot.displayTitle);
  editor.emit(legacySnapshot);
  assert.equal(editor.find(".ho-title-text")?.textContent, legacySnapshot.displayTitle);

  harness.hook.destroy();
  assert.equal(harness.flagListenerCount(), 0);
  harness.reinstall();
  assert.equal(harness.flagListenerCount(), 1);
  harness.sandbox.__H2O_STAGE1E_B0_TEST__.destroy();
  assert.equal(harness.flagListenerCount(), 0);
});

await scenario("display-only canonical scenarios issue zero persistent title writes", () => {
  const harness = createB0Harness({ flag: true });
  harness.effects.resetTransient();
  assert.equal(harness.hook.displayFrom("Display only - intact", "✨"), "✨ Display only - intact");
  harness.api.debug.refreshDisplay("display-only");
  assert.equal(harness.effects.storageOps.length, 0);
  assert.equal(harness.effects.fetches.length, 0);
});

await scenario("browser-tab destroy and reinstall retain one live observer subscription and timer set", () => {
  const state = {
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Base",
    displayTitle: "Canonical",
    documentTitle: "Canonical",
    convergence: { enabled: true, mode: "canonical" },
  };
  const harness = createTabHarness(state);
  harness.evaluate();
  const first = {
    subscriptions: harness.activeSubscriptions(),
    listeners: harness.listenerCount(),
    timers: harness.activeTimerCount(),
    observers: harness.activeObserverCount(),
  };
  harness.evaluate();
  const second = {
    subscriptions: harness.activeSubscriptions(),
    listeners: harness.listenerCount(),
    timers: harness.activeTimerCount(),
    observers: harness.activeObserverCount(),
  };
  assert.deepEqual(second, first);
  assert.equal(second.subscriptions, 1);
  assert.equal(second.observers, 1);
});

function adoptedSidebar(options = {}) {
  const routeChatId = options.chatId ||
    String(options.routePath || "").match(/\/c\/([^/?#]+)/u)?.[1] ||
    "stage1eb-chat-a";
  const harness = createSidebarHarness({
    chatId: routeChatId,
    displayTitle: options.displayTitle ?? "Canonical display",
    baseTitle: options.baseTitle ?? "Native clean",
    emoji: options.emoji ?? "",
    convergence: options.convergence || { enabled: true, mode: "canonical" },
    ...(options.routePath ? { routePath: options.routePath } : {}),
  });
  const rowOptions = {
    nativeTitle: options.nativeTitle ?? "Native clean",
    href: options.href,
  };
  for (const key of ["ariaLabelledby", "ariaLabel", "title"]) {
    if (Object.prototype.hasOwnProperty.call(options, key)) rowOptions[key] = options[key];
  }
  const row = harness.createRow(rowOptions);
  harness.evaluate();
  harness.runFrames();
  return { harness, row };
}

async function seedConfirmedUserTitle(harness, submittedTitle, operationId) {
  const state = harness.api.getState();
  const result = await harness.api.renameNative(submittedTitle, {
    userInitiated: true,
    source: "under-input",
    chatId: state.chatId,
    expectedRouteToken: state.routeToken,
    expectedRouteKind: "chat",
    operationId,
  });
  assert.equal(result.ok, true);
  harness.effects.resetTransient();
  return currentRecord(harness);
}

function installStaleSidebarAdoption(harness, row, options = {}) {
  const staleId = options.staleId || `stale-visual-${Math.random().toString(36).slice(2, 8)}`;
  let visual = null;
  if (options.includeVisual !== false) {
    visual = harness.dom.document.createElement("span");
    visual.id = staleId;
    visual.setAttribute("data-h2o-owner", "title-sidebar-renderer");
    visual.setAttribute("data-h2o-title-role", "visual");
    visual.textContent = options.displayTitle || "Stale canonical";
    row.layout.appendChild(visual);
  }
  row.source.setAttribute("data-h2o-title-native-owner", "title-sidebar-renderer");
  row.source.setAttribute("data-h2o-title-native-hidden", "1");
  row.anchor.setAttribute("data-h2o-title-sidebar-adopted", "1");
  row.anchor.setAttribute(
    "data-h2o-title-aria-labelledby-absent",
    options.originalPresent ? "0" : "1",
  );
  if (options.originalPresent) {
    row.anchor.setAttribute(
      "data-h2o-title-aria-labelledby-original",
      options.originalValue || "native-original",
    );
  }
  row.anchor.setAttribute("data-h2o-title-aria-labelledby-visual-id", staleId);
  if (options.currentValue === null) row.anchor.removeAttribute("aria-labelledby");
  else row.anchor.setAttribute("aria-labelledby", options.currentValue || staleId);
  return { staleId, visual };
}

await scenario("sidebar flag disabled leaves native DOM untouched", () => {
  const { harness, row } = adoptedSidebar({
    convergence: { enabled: false, mode: "legacy" },
  });
  assert.equal(harness.visual(row), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), false);
});

await scenario("sidebar canonical ordinary title is displayed byte-exactly", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Canonical ordinary" });
  assert.equal(harness.visual(row)?.textContent, "Canonical ordinary");
  assert.equal(harness.renderedText(row), "Canonical ordinary");
  assert.equal(harness.nativeText(row), "Native clean");
});

await scenario("sidebar canonical emoji is displayed once", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "✨ Canonical", emoji: "✨" });
  assert.equal(harness.renderedText(row), "✨ Canonical");
  assert.equal((harness.renderedText(row).match(/✨/gu) || []).length, 1);
});

await scenario("sidebar preserves multi-code-point emoji", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "👩🏽‍💻 Developer notes" });
  assert.equal(harness.visual(row)?.textContent, "👩🏽‍💻 Developer notes");
});

await scenario("sidebar preserves internal dash text", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Alpha - Beta - Notes" });
  assert.equal(harness.renderedText(row), "Alpha - Beta - Notes");
});

await scenario("sidebar displays Arabic canonical text byte-exactly", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "مرحبا بالعالم ✨" });
  assert.equal(harness.visual(row)?.textContent, "مرحبا بالعالم ✨");
  assert.equal(harness.visual(row)?.getAttribute("dir"), "auto");
});

await scenario("sidebar displays Hebrew canonical text byte-exactly", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "שלום עולם ✨" });
  assert.equal(harness.visual(row)?.textContent, "שלום עולם ✨");
});

await scenario("sidebar supports an emoji-only canonical display", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "👩🏽‍💻", baseTitle: "", emoji: "👩🏽‍💻" });
  assert.equal(harness.renderedText(row), "👩🏽‍💻");
});

await scenario("sidebar leaves a wrong-chat row untouched", () => {
  const { harness, row } = adoptedSidebar({ href: "/c/stage1eb-chat-b" });
  assert.equal(harness.visual(row), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar exact-route matching rejects prefix paths", () => {
  const { harness, row } = adoptedSidebar({ href: "/c/stage1eb-chat-a-extra" });
  assert.equal(harness.visual(row), null);
  const exact = adoptedSidebar({
    href: "https://chatgpt.com/c/stage1eb-chat-a?model=gpt-5#latest",
    displayTitle: "Query-safe canonical",
  });
  assert.equal(exact.harness.renderedText(exact.row), "Query-safe canonical");
});

await scenario("sidebar direct chat route identity adopts exactly", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/c/stage1eb-direct-chat",
    displayTitle: "Direct canonical",
  });
  assert.equal(harness.renderedText(row), "Direct canonical");
});

await scenario("sidebar project-scoped chat route identity adopts exactly", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    displayTitle: "Project canonical",
  });
  assert.equal(harness.renderedText(row), "Project canonical");
});

await scenario("sidebar project route rejects a wrong project identity", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    href: "/g/g-p-project-b/c/stage1eb-other-chat",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar same chat under another project is not interchangeable", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-shared-chat",
    href: "/g/g-p-project-b/c/stage1eb-shared-chat",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar project route rejects a prefixed chat ID", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    href: "/g/g-p-project-a/c/stage1eb-project-chat-extra",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar project route rejects extra path segments", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    href: "/g/g-p-project-a/c/stage1eb-project-chat/details",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar project route ignores query and fragment while matching pathname", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat?model=gpt-5#latest",
    href: "https://chatgpt.com/g/g-p-project-a/c/stage1eb-project-chat?view=compact#row",
    displayTitle: "Project query-safe canonical",
  });
  assert.equal(harness.renderedText(row), "Project query-safe canonical");
});

await scenario("sidebar project route A to B releases before B re-adoption", () => {
  const harness = createSidebarHarness({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat-a",
    chatId: "stage1eb-project-chat-a",
    displayTitle: "Project A canonical",
  });
  const container = harness.ensureContainer();
  const rowA = harness.createRow({
    container,
    href: "/g/g-p-project-a/c/stage1eb-project-chat-a",
    nativeTitle: "Project A native",
  });
  const rowB = harness.createRow({
    container,
    href: "/g/g-p-project-b/c/stage1eb-project-chat-b",
    nativeTitle: "Project B native",
  });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.renderedText(rowA), "Project A canonical");
  harness.setLocation("/g/g-p-project-b/c/stage1eb-project-chat-b");
  harness.emit({
    chatId: "stage1eb-project-chat-b",
    routeToken: 2,
    baseTitle: "Project B native",
    displayTitle: "Project B canonical",
  });
  assert.equal(harness.visual(rowA), null);
  assert.equal(harness.renderedText(rowB), "Project B native");
  harness.runFrames();
  assert.equal(harness.renderedText(rowB), "Project B canonical");
});

await scenario("sidebar adopts every visible duplicate active row", () => {
  const harness = createSidebarHarness({ displayTitle: "Duplicate canonical" });
  const nav = harness.ensureContainer("nav");
  const aside = harness.ensureContainer("aside");
  const left = harness.createRow({ container: nav });
  const right = harness.createRow({ container: aside });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.renderedText(left), "Duplicate canonical");
  assert.equal(harness.renderedText(right), "Duplicate canonical");
  assert.equal(harness.runtime().diagnose().adoptedRows, 2);
});

await scenario("sidebar caps adoption at six and diagnoses extras", () => {
  const harness = createSidebarHarness({ displayTitle: "Bounded canonical" });
  const container = harness.ensureContainer();
  const rows = Array.from({ length: 8 }, () => harness.createRow({ container }));
  harness.evaluate();
  harness.runFrames();
  assert.equal(rows.filter((row) => harness.visual(row)).length, 6);
  assert.equal(harness.visual(rows[6]), null);
  assert.equal(harness.visual(rows[7]), null);
  assert.equal(harness.runtime().diagnose().overflowCandidates, 2);
});

await scenario("sidebar refuses a row without a native title source", () => {
  const harness = createSidebarHarness();
  const row = harness.createRow({ nativeTitle: null });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar adopts when the native title source appears later", () => {
  const harness = createSidebarHarness({ displayTitle: "Late canonical" });
  const row = harness.createRow({ nativeTitle: null });
  harness.evaluate();
  harness.runFrames();
  const source = harness.dom.document.createElement("span");
  source.className = "truncate";
  source.textContent = "Late native";
  row.layout.appendChild(source);
  row.source = source;
  harness.triggerMutation([{ target: row.layout, addedNodes: [source], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Late canonical");
  assert.equal(source.textContent, "Late native");
});

await scenario("sidebar re-adopts a replaced native title node", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Replacement canonical" });
  const oldSource = row.source;
  const replacement = harness.dom.document.createElement("span");
  replacement.className = "truncate";
  replacement.textContent = "Replacement native";
  oldSource.remove();
  row.layout.prepend(replacement);
  row.source = replacement;
  harness.triggerMutation([{ target: row.layout, addedNodes: [replacement], removedNodes: [oldSource] }]);
  assert.equal(harness.visual(row), null, "old adoption must release synchronously");
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Replacement canonical");
  assert.equal(replacement.textContent, "Replacement native");
});

await scenario("sidebar releases and adopts an entirely replaced row", () => {
  const { harness, row: oldRow } = adoptedSidebar({ displayTitle: "Row replacement canonical" });
  const container = oldRow.container;
  oldRow.anchor.remove();
  const newRow = harness.createRow({ container, nativeTitle: "New row native" });
  harness.triggerMutation([{ target: container, addedNodes: [newRow.anchor], removedNodes: [oldRow.anchor] }]);
  assert.equal(oldRow.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(oldRow.anchor.hasAttribute("aria-labelledby"), false);
  harness.runFrames();
  assert.equal(harness.renderedText(newRow), "Row replacement canonical");
});

await scenario("sidebar releases a row whose href is reused for another chat", () => {
  const { harness, row } = adoptedSidebar();
  row.anchor.setAttribute("href", "/c/stage1eb-chat-b");
  harness.triggerMutation([{ target: row.anchor, attributeName: "href" }]);
  assert.equal(harness.visual(row), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  harness.runFrames();
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar handles virtualized row disappearance and return", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Virtual canonical" });
  const container = row.container;
  row.anchor.remove();
  harness.triggerMutation([{ target: container, addedNodes: [], removedNodes: [row.anchor] }]);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  container.appendChild(row.anchor);
  harness.triggerMutation([{ target: container, addedNodes: [row.anchor], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Virtual canonical");
});

await scenario("sidebar container collapse and expand rolls back then re-adopts", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Collapse canonical" });
  const parent = row.container.parentElement;
  row.container.remove();
  harness.triggerMutation([{ target: parent, addedNodes: [], removedNodes: [row.container] }]);
  assert.equal(harness.visual(row), null);
  parent.appendChild(row.container);
  harness.triggerMutation([{ target: parent, addedNodes: [row.container], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Collapse canonical");
});

await scenario("sidebar rollback restores originally absent aria-labelledby", () => {
  const { harness, row } = adoptedSidebar();
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), true);
  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), false);
});

await scenario("sidebar rollback restores original aria-labelledby exactly", () => {
  const { harness, row } = adoptedSidebar({ ariaLabelledby: "native-label native-detail" });
  assert.notEqual(row.anchor.getAttribute("aria-labelledby"), "native-label native-detail");
  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "native-label native-detail");
});

await scenario("sidebar never writes the anchor aria-label", () => {
  const { harness, row } = adoptedSidebar({ ariaLabel: "Native accessible label" });
  assert.equal(row.anchor.getAttribute("aria-label"), "Native accessible label");
  harness.emit({ displayTitle: "Changed canonical" });
  harness.runFrames();
  assert.equal(row.anchor.getAttribute("aria-label"), "Native accessible label");
});

await scenario("sidebar never writes the anchor title", () => {
  const { harness, row } = adoptedSidebar({ title: "Native hover title" });
  assert.equal(row.anchor.getAttribute("title"), "Native hover title");
  harness.emit({ displayTitle: "Changed canonical" });
  harness.runFrames();
  assert.equal(row.anchor.getAttribute("title"), "Native hover title");
});

await scenario("sidebar writes no native raw-title attributes", () => {
  const { row } = adoptedSidebar();
  for (const element of [row.anchor, row.source, ...row.layout.children]) {
    assert.equal(
      [...element._attributes.keys()].some((name) => /^data-ho-raw-title(?:-|$)/u.test(name)),
      false,
    );
  }
});

await scenario("reader INV-1 returns unchanged clean native base for every clean reader", () => {
  const { harness, row } = adoptedSidebar({
    nativeTitle: "Clean native base",
    displayTitle: "✨ Canonical display",
  });
  const coordinator = createB0Harness({ flag: true });
  const fixture = coordinator.setSidebarReaderFixture(
    "Clean native base",
    "✨ Canonical display contamination sentinel",
  );
  assert.equal(fixture.native.closest("[data-h2o-owner]"), null);
  assert.equal(fixture.visual.closest("[data-h2o-owner]"), fixture.visual);
  assert.equal(coordinator.hook.readSidebarTitle("stage1e-chat-a"), "Clean native base");
  fixture.removeVisualOwnership();
  assert.notEqual(
    coordinator.hook.readSidebarTitle("stage1e-chat-a"),
    "Clean native base",
    "negative control must expose contamination when ownership is absent",
  );
  fixture.restoreVisualOwnership();
  assert.equal(coordinator.hook.readSidebarTitle("stage1e-chat-a"), "Clean native base");
  fixture.replaceNative("Replacement native base");
  assert.equal(
    coordinator.hook.readSidebarTitle("stage1e-chat-a"),
    "Replacement native base",
    "native replacement window must still exclude the old owned visual",
  );
  const readers = runReaderSlices(harness, row);
  assert.equal(readers.f1cNative, "Clean native base");
  assert.equal(readers.f2aNative, "Clean native base");
  assert.equal(readers.f3aNative, "Clean native base");
  assert.equal(readers.f6aTruncateTarget, "Clean native base");
  assert.equal(readers.f6aTruncateMatchedVisual, false);
  assert.equal(readers.f6aVisualAfterTruncateTarget, "✨ Canonical display");
});

await scenario("reader INV-2 intentional rendered readers see canonical display", () => {
  const { harness, row } = adoptedSidebar({
    nativeTitle: "Clean native base",
    displayTitle: "✨ Canonical display",
  });
  const readers = runReaderSlices(harness, row);
  assert.equal(readers.f3aRendered, "✨ Canonical display");
  assert.equal(readers.f6aRendered, "✨ Canonical display");
  assert.equal(readers.d3aRendered, "✨ Canonical display");
});

await scenario("reader INV-2 genuine Library re-entry cannot contaminate base or duplicate emoji", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "✨ Clean native base", "library-reentry-ordinary-seed");
  const sidebar = adoptedSidebar({
    nativeTitle: "Clean native base",
    displayTitle: "✨ Clean native base",
  });
  const rendered = runReaderSlices(sidebar.harness, sidebar.row).f6aRendered;
  const before = currentRecord(coordinator);
  const callsBefore = coordinator.hook.setTitleCallCount();
  coordinator.setLibraryTitle(chatId, rendered);
  assert.equal(coordinator.hook.readLibraryTitle(chatId), rendered);
  coordinator.hook.detectTitles("stage1eb-library-rendered-reentry");
  assert(coordinator.hook.setTitleCallCount() > callsBefore, "detectTitles must execute setTitle");
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.api.getState().displayTitle, "✨ Clean native base");
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 repeated four-cycle Library re-entry is idempotent", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "✨ Cycle-safe title", "library-reentry-cycle-seed");
  const before = currentRecord(coordinator);
  for (let cycle = 0; cycle < 4; cycle += 1) {
    coordinator.setLibraryTitle(chatId, coordinator.api.getState().displayTitle);
    coordinator.hook.detectTitles(`stage1eb-library-cycle-${cycle}`);
    assert.equal(coordinator.api.getState().displayTitle, "✨ Cycle-safe title");
  }
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 multi-code-point emoji Library re-entry remains single", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "👩🏽‍💻 Developer notes", "library-reentry-multi-seed");
  const before = currentRecord(coordinator);
  coordinator.setLibraryTitle(chatId, coordinator.api.getState().displayTitle);
  coordinator.hook.detectTitles("stage1eb-library-multi-reentry");
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.api.getState().emoji, "👩🏽‍💻");
  assert.equal(coordinator.api.getState().displayTitle, "👩🏽‍💻 Developer notes");
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 real chooseBetterTitle cannot poison user-tier canonical state", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "✨ User title", "library-reentry-priority-seed");
  const before = currentRecord(coordinator);
  const longerLibraryValue = chooseBetterLibraryTitle(
    "Short cache",
    "✨ User title with a much longer stale Library description",
    chatId,
  );
  assert.equal(longerLibraryValue, "✨ User title with a much longer stale Library description");
  coordinator.setLibraryTitle(chatId, longerLibraryValue);
  coordinator.hook.detectTitles("stage1eb-library-longer-reentry");
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.api.getState().displayTitle, "✨ User title");
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 inactive Library row remains non-mutating", async () => {
  const coordinator = createB0Harness({ flag: true });
  const activeChatId = coordinator.api.getState().chatId;
  const inactiveChatId = "stage1e-chat-inactive";
  await seedConfirmedUserTitle(coordinator, "✨ Active title", "library-reentry-inactive-seed");
  const activeBefore = currentRecord(coordinator);
  const inactiveBefore = recordFor(coordinator, inactiveChatId);
  coordinator.setLibraryTitle(inactiveChatId, "🚀 Inactive canonical display");
  coordinator.hook.detectTitles("stage1eb-library-inactive-reentry");
  assert.deepEqual(currentRecord(coordinator), activeBefore);
  assert.deepEqual(recordFor(coordinator, inactiveChatId), inactiveBefore);
  assert.equal(coordinator.api.getState().chatId, activeChatId);
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("sidebar route A to B never leaks A display onto B", () => {
  const harness = createSidebarHarness({ displayTitle: "Chat A canonical" });
  const container = harness.ensureContainer();
  const rowA = harness.createRow({ container, href: "/c/stage1eb-chat-a", nativeTitle: "Chat A native" });
  const rowB = harness.createRow({ container, href: "/c/stage1eb-chat-b", nativeTitle: "Chat B native" });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.renderedText(rowA), "Chat A canonical");
  harness.setLocation("/c/stage1eb-chat-b");
  harness.emit({
    chatId: "stage1eb-chat-b",
    routeToken: 2,
    baseTitle: "Chat B native",
    displayTitle: "Chat B canonical",
  });
  assert.equal(harness.visual(rowA), null);
  assert.equal(harness.renderedText(rowB), "Chat B native");
  harness.runFrames();
  assert.equal(harness.renderedText(rowB), "Chat B canonical");
});

await scenario("sidebar flag rollback restores exact native state", () => {
  const { harness, row } = adoptedSidebar({
    nativeTitle: "Exact native bytes",
    ariaLabelledby: "native-id",
  });
  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(row.source.textContent, "Exact native bytes");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "native-id");
  assert.equal(harness.visual(row), null);
  assert.equal(harness.dom.document.getElementById("h2o-title-sidebar-renderer-style-v1"), null);
});

await scenario("sidebar boot crash recovery removes stale adoption and restores escrow", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow({ nativeTitle: "Crash native" });
  const { visual: stale } = installStaleSidebarAdoption(harness, row, {
    staleId: "stale-visual",
    originalPresent: true,
    originalValue: "native-before-crash",
  });
  harness.evaluate();
  assert.equal(stale.isConnected, false);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "native-before-crash");
});

await scenario("sidebar crash recovery removes stale aria when original was absent", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, { originalPresent: false });
  harness.evaluate();
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), false);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar crash recovery preserves fresh React aria after originally absent state", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, {
    originalPresent: false,
    currentValue: "react-fresh-label",
  });
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "react-fresh-label");
});

await scenario("sidebar crash recovery preserves fresh React aria over escrowed original", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, {
    originalPresent: true,
    originalValue: "native-before-crash",
    currentValue: "react-fresh-label",
  });
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "react-fresh-label");
});

await scenario("sidebar crash recovery is idempotent", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, {
    originalPresent: true,
    originalValue: "native-before-crash",
    currentValue: "react-fresh-label",
  });
  harness.evaluate();
  const afterFirst = row.anchor.getAttribute("aria-labelledby");
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), afterFirst);
  assert.equal(row.anchor.hasAttribute("data-h2o-title-sidebar-adopted"), false);
});

await scenario("sidebar crash recovery preserves fresh aria when stale visual is already missing", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const container = harness.ensureContainer();
  const row = harness.createRow({ container });
  const danglingRow = harness.createRow({ container });
  installStaleSidebarAdoption(harness, row, {
    includeVisual: false,
    originalPresent: true,
    originalValue: "native-before-crash",
    currentValue: "react-fresh-label",
  });
  installStaleSidebarAdoption(harness, danglingRow, {
    includeVisual: false,
    staleId: "missing-stale-visual",
    originalPresent: false,
  });
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "react-fresh-label");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(danglingRow.anchor.hasAttribute("aria-labelledby"), false);
});

await scenario("sidebar crash recovery restores duplicate rows independently", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const container = harness.ensureContainer();
  const absentRow = harness.createRow({ container });
  const presentRow = harness.createRow({ container });
  installStaleSidebarAdoption(harness, absentRow, {
    staleId: "stale-duplicate-absent",
    originalPresent: false,
  });
  installStaleSidebarAdoption(harness, presentRow, {
    staleId: "stale-duplicate-present",
    originalPresent: true,
    originalValue: "native-duplicate-original",
  });
  harness.evaluate();
  assert.equal(absentRow.anchor.hasAttribute("aria-labelledby"), false);
  assert.equal(presentRow.anchor.getAttribute("aria-labelledby"), "native-duplicate-original");
  assert.equal(absentRow.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(presentRow.source.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar destroy and reinstall leaves one runtime subscription observer and visual", () => {
  const harness = createSidebarHarness({ displayTitle: "Reinstall canonical" });
  const row = harness.createRow();
  harness.evaluate();
  harness.runFrames();
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.subscriptionCount(), 1);
  assert.equal(harness.observerCount(), 1);
  assert.equal(row.anchor.querySelectorAll(
    '[data-h2o-owner="title-sidebar-renderer"][data-h2o-title-role="visual"]',
  ).length, 1);
});

await scenario("sidebar native-source replacement releases synchronously", () => {
  const { harness, row } = adoptedSidebar();
  const oldSource = row.source;
  const replacement = harness.dom.document.createElement("span");
  replacement.className = "truncate";
  replacement.textContent = "Replacement";
  oldSource.remove();
  row.layout.prepend(replacement);
  row.source = replacement;
  harness.triggerMutation([{ target: row.layout, addedNodes: [replacement], removedNodes: [oldSource] }]);
  assert.equal(harness.visual(row), null);
  assert.equal(oldSource.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar ignores renderer-owned mutations without rescan loops", () => {
  const { harness, row } = adoptedSidebar();
  const scans = harness.runtime().diagnose().scans;
  const visual = harness.visual(row);
  harness.triggerMutation([{ target: visual, addedNodes: [visual], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.runtime().diagnose().scans, scans);
});

await scenario("sidebar INV-3 performs zero PATCH or network calls", () => {
  const { harness } = adoptedSidebar({ displayTitle: "No network" });
  assert.equal(harness.mutations.patches, 0);
});

await scenario("sidebar INV-3 performs zero Store boot-cache or localStorage writes", () => {
  const { harness } = adoptedSidebar({ displayTitle: "No persistence" });
  assert.equal(harness.mutations.storeWrites, 0);
  assert.deepEqual(harness.effects.storageOps, []);
});

await scenario("sidebar INV-3 performs zero canonical mutations", () => {
  const { harness } = adoptedSidebar({ displayTitle: "No mutation" });
  assert.equal(harness.mutations.canonical, 0);
});

/* ── Stage 1F live rollback regression ─────────────────────────────────────
   Reproduces the confirmed browser canary divergence: a base title with an
   internal " - " separator collapsed to its final segment in legacy mode,
   and the revealed native sidebar row kept a pre-rename title. */

const LIVE_BASE_TITLE = "Title Canary Alpha - Beta";
const LIVE_EMOJI = "🔶";
const LIVE_DISPLAY_TITLE = `${LIVE_EMOJI} ${LIVE_BASE_TITLE}`;
const LIVE_STALE_NATIVE_TITLE = `${LIVE_EMOJI} Talk about something`;

await scenario("live regression: internal separator survives legacy canonical legacy transitions", async () => {
  const harness = createB0Harness({ flag: false });
  const chatId = harness.api.getState().chatId;
  await seedConfirmedUserTitle(harness, LIVE_DISPLAY_TITLE, "stage1f-live-seed");
  assert.equal(harness.api.getState().baseTitle, LIVE_BASE_TITLE);
  assert.equal(harness.api.getState().emoji, LIVE_EMOJI);

  // legacy (flag off) must not collapse the hyphenated base to its last segment
  assert.equal(harness.api.getState().convergence.enabled, false);
  assert.equal(harness.api.getState().displayTitle, LIVE_DISPLAY_TITLE);
  assert.equal(harness.hook.legacyDisplayFrom(LIVE_BASE_TITLE, LIVE_EMOJI), LIVE_DISPLAY_TITLE);

  // legacy -> canonical
  harness.setRuntimeFlag(true);
  assert.equal(harness.api.getState().convergence.mode, "canonical");
  assert.equal(harness.api.getState().displayTitle, LIVE_DISPLAY_TITLE);
  assert.equal(harness.api.getState().baseTitle, LIVE_BASE_TITLE);

  // canonical -> legacy (the live rollback step)
  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().convergence.mode, "legacy");
  assert.equal(harness.api.getState().displayTitle, LIVE_DISPLAY_TITLE);
  assert.equal(harness.api.getState().baseTitle, LIVE_BASE_TITLE);
  assert.notEqual(harness.api.getState().displayTitle, `${LIVE_EMOJI} Beta`);
});

await scenario("live regression: legacy sanitizer preserves internal separators and suffix rules", () => {
  const harness = createB0Harness({ flag: false });
  const cases = [
    ["Title Canary Alpha - Beta", "Title Canary Alpha - Beta"],
    ["Alpha - Beta", "Alpha - Beta"],
    ["Alpha - Beta - ChatGPT", "Alpha - Beta"],
    ["Design - implementation", "Design - implementation"],
    ["Release plan - ChatGPT", "Release plan"],
    ["Title - ChatGPT - ChatGPT", "Title - ChatGPT"],
    ["ChatGPT", ""],
    ["  spaced   base  ", "spaced base"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(harness.hook.legacyDisplayFrom(input, ""), expected, `legacy base for ${JSON.stringify(input)}`);
  }
  // legacy ingestion must not truncate a hyphenated native title either
  assert.equal(harness.hook.splitNativeSubmission("Title Canary Alpha - Beta").baseTitle, "Title Canary Alpha - Beta");
});

await scenario("live regression: confirmed rename reconciles the stale native sidebar row", async () => {
  const harness = createB0Harness({ flag: true });
  const chatId = harness.api.getState().chatId;
  const fixture = harness.setSidebarReaderFixture(LIVE_STALE_NATIVE_TITLE, "");
  const foreign = harness.addForeignSidebarRow("stage1e-chat-foreign", "Foreign untouched");
  harness.effects.resetTransient();

  const result = await harness.api.renameNative(LIVE_DISPLAY_TITLE, {
    userInitiated: true,
    source: "under-input",
    chatId,
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "stage1f-native-reconcile",
  });
  assert.equal(result.ok, true);

  // exactly one PATCH, carrying the clean base only
  const patches = harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH");
  assert.equal(patches.length, 1);
  assert.deepEqual(JSON.parse(patches[0].options.body), { title: LIVE_BASE_TITLE });

  // the revealed native row now carries the confirmed clean base, never the composed display
  assert.equal(fixture.native.textContent, LIVE_BASE_TITLE);
  assert.notEqual(fixture.native.textContent, LIVE_DISPLAY_TITLE);
  assert.equal(fixture.native.textContent.includes(LIVE_EMOJI), false);
  // 9B0a must not take renderer ownership of the native node
  assert.equal(fixture.native.getAttribute("data-h2o-owner"), null);
  assert.equal(fixture.anchor.getAttribute("data-h2o-title-sidebar-adopted"), null);
  // native readers still see the clean confirmed base
  assert.equal(harness.hook.readSidebarTitle(chatId), LIVE_BASE_TITLE);
  // wrong-chat rows are never rewritten
  assert.equal(foreign.native.textContent, "Foreign untouched");
});

await scenario("live regression: rollback keeps the emoji and teardown reveals the native title", async () => {
  const harness = createB0Harness({ flag: true });
  const chatId = harness.api.getState().chatId;
  const fixture = harness.setSidebarReaderFixture(LIVE_STALE_NATIVE_TITLE, "");
  await seedConfirmedUserTitle(harness, LIVE_DISPLAY_TITLE, "stage1f-rollback-seed");
  assert.equal(fixture.native.textContent, LIVE_BASE_TITLE);

  const sidebar = adoptedSidebar({
    nativeTitle: LIVE_BASE_TITLE,
    displayTitle: LIVE_DISPLAY_TITLE,
    baseTitle: LIVE_BASE_TITLE,
    emoji: LIVE_EMOJI,
  });
  assert.equal(sidebar.harness.renderedText(sidebar.row), LIVE_DISPLAY_TITLE);
  assert.equal(sidebar.row.anchor.hasAttribute("aria-labelledby"), true);

  sidebar.harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  sidebar.harness.runFrames();

  // Convergence OFF drops title authority, not the emoji: the passive legacy
  // presentation stays and the native node is still only hidden, never rewritten.
  assert.notEqual(sidebar.harness.visual(sidebar.row), null);
  assert.equal(sidebar.harness.renderedText(sidebar.row), LIVE_DISPLAY_TITLE);
  assert.equal(sidebar.row.anchor.getAttribute("aria-labelledby"), sidebar.harness.visual(sidebar.row).id);
  assert.equal(sidebar.row.source.textContent, LIVE_BASE_TITLE);
  assert.equal(sidebar.harness.runtime().diagnose().presentationMode, "legacy");
  assert.equal(sidebar.harness.mutations.patches, 0);
  assert.equal(sidebar.harness.mutations.canonical, 0);
  assert.equal(sidebar.harness.mutations.storeWrites, 0);

  // Teardown is where the untouched native title becomes the safe fallback.
  sidebar.harness.destroy();
  assert.equal(sidebar.harness.visual(sidebar.row), null);
  assert.equal(sidebar.row.anchor.hasAttribute("aria-labelledby"), false);
  assert.equal(sidebar.row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(sidebar.row.source.textContent, LIVE_BASE_TITLE);
  assert.equal(sidebar.harness.renderedText(sidebar.row), LIVE_BASE_TITLE);

  // the coordinator's legacy display is still the full confirmed title
  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().displayTitle, LIVE_DISPLAY_TITLE);
});

await scenario("live regression: store.persist bridge timeout does not alter canonical display", async () => {
  const harness = createB0Harness({ flag: true });
  await seedConfirmedUserTitle(harness, LIVE_DISPLAY_TITLE, "stage1f-persist-seed");
  // attach the durable Store so persistRecord executes its real failure branch
  harness.runTimers("timeout");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().storageBackend, "stage1e-store");
  const before = currentRecord(harness);
  harness.failNextPersist("bridge timeout (1500ms)");
  harness.api.setEmoji({
    chatId: harness.api.getState().chatId,
    emoji: LIVE_EMOJI,
    source: "user",
    priority: 100,
  }, { force: true, reason: "stage1f-persist-probe" });
  await flushMicrotasks(8);

  const state = harness.api.getState();
  // the real persist branch ran and failed exactly once
  assert.equal(harness.storeSetCalls(), 1);
  assert.match(harness.api.selfCheck().lastError, /^store\.persist: bridge timeout \(1500ms\)$/u);
  assert.equal(state.baseTitle, LIVE_BASE_TITLE);
  assert.equal(state.emoji, LIVE_EMOJI);
  assert.equal(state.displayTitle, LIVE_DISPLAY_TITLE);
  assert.equal(state.convergence.mode, "canonical");
  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().displayTitle, LIVE_DISPLAY_TITLE);
  assert.equal(currentRecord(harness).baseTitle, before.baseTitle);
});

/* ── Stage 1F reload-persistence regression ────────────────────────────────
   Live sequence: a confirmed rename to "Title Canary Gamma - Delta" succeeded
   against a durable Store, but the boot cache kept the previous confirmed
   "Title Canary Alpha - Beta" record. After a reload with the durable bridge
   unavailable, that stale priority-100 record defeated the current native
   title indefinitely. */

const RELOAD_OLD_BASE = "Title Canary Alpha - Beta";
const RELOAD_NEW_BASE = "Title Canary Gamma - Delta";
const RELOAD_EMOJI = "🔶";
const RELOAD_NEW_DISPLAY = `${RELOAD_EMOJI} ${RELOAD_NEW_BASE}`;

function bootCacheKeyFor(chatId) {
  return `h2o:prm:cgx:library:chat-title:boot-cache:v1:${chatId}`;
}

function staleBootCacheSeed(chatId, baseTitle = RELOAD_OLD_BASE) {
  const stamp = 1785426477911;
  return {
    [bootCacheKeyFor(chatId)]: JSON.stringify({
      version: 1,
      chatId,
      state: {
        version: 1,
        chatId,
        baseTitle,
        source: "user",
        priority: 100,
        confidence: 1,
        emoji: RELOAD_EMOJI,
        emojiSource: "native-title",
        emojiPriority: 90,
        emojiConfidence: 0.95,
        updatedAt: stamp,
        emojiUpdatedAt: 1785239809513,
      },
      updatedAt: stamp + 6537,
      expiresAt: stamp + 604800000,
    }),
  };
}

function readBootCacheRecord(harness, chatId) {
  const raw = harness.storage.entries()[bootCacheKeyFor(chatId)];
  return raw ? JSON.parse(raw) : null;
}

await scenario("live reload: confirmed rename refreshes the boot cache even when the durable Store succeeds", async () => {
  const harness = createB0Harness({ flag: true });
  const chatId = harness.api.getState().chatId;
  harness.runTimers("timeout");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().storageBackend, "stage1e-store");

  await seedConfirmedUserTitle(harness, `${RELOAD_EMOJI} ${RELOAD_NEW_BASE}`, "stage1f-reload-write");
  await flushMicrotasks(8);

  // the durable Store write must not be the only durable copy
  assert.equal(harness.storeSetCalls() >= 1, true);
  const cached = readBootCacheRecord(harness, chatId);
  assert(cached, "confirmed rename must leave a boot-cache record");
  assert.equal(cached.state.baseTitle, RELOAD_NEW_BASE);
  assert.equal(cached.state.emoji, RELOAD_EMOJI);
  assert.notEqual(cached.state.baseTitle, RELOAD_OLD_BASE);
});

await scenario("live reload: stale boot record cannot defeat the current native title", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  // fresh document: durable bridge unavailable, stale boot cache, current native title
  const reload = createB0Harness({
    flag: true,
    store: "none",
    documentTitle: `${RELOAD_NEW_BASE} - ChatGPT`,
    storageSeed: staleBootCacheSeed(chatId),
  });
  reload.setRoute(`/c/${chatId}`);
  reload.setSidebarReaderFixture(RELOAD_NEW_BASE, "");
  reload.api.refresh("stage1f-reload-boot");
  await flushMicrotasks(8);

  const state = reload.api.getState();
  assert.equal(state.chatId, chatId);
  assert.equal(state.baseTitle, RELOAD_NEW_BASE, "current native title must win over the stale boot record");
  assert.equal(state.emoji, RELOAD_EMOJI, "separately stored emoji must survive reconciliation");
  assert.equal(state.displayTitle, RELOAD_NEW_DISPLAY);
  assert.equal(state.convergence.enabled, true);

  // durability is honestly reported and no error is invented
  const check = reload.api.selfCheck();
  assert.equal(check.storageBackend, "memory");
  assert.equal(check.durability.durable, false);

  // reconciliation performs no PATCH and no wrong-chat write
  assert.equal(reload.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);
  assert.equal(recordFor(reload, "stage1e-chat-b"), null);

  // the corrected record is written back so a second reload is already clean
  const refreshed = readBootCacheRecord(reload, chatId);
  assert(refreshed, "reconciled record must refresh the boot cache");
  assert.equal(refreshed.state.baseTitle, RELOAD_NEW_BASE);
  assert.equal(refreshed.state.emoji, RELOAD_EMOJI);
});

await scenario("live reload: legacy mode reconciles the same stale record without hyphen truncation", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const reload = createB0Harness({
    flag: false,
    store: "none",
    documentTitle: `${RELOAD_NEW_BASE} - ChatGPT`,
    storageSeed: staleBootCacheSeed(chatId),
  });
  reload.setRoute(`/c/${chatId}`);
  reload.setSidebarReaderFixture(RELOAD_NEW_BASE, "");
  reload.api.refresh("stage1f-reload-legacy");
  await flushMicrotasks(8);

  const state = reload.api.getState();
  assert.equal(state.baseTitle, RELOAD_NEW_BASE);
  assert.equal(state.displayTitle, RELOAD_NEW_DISPLAY);
  assert.equal(state.convergence.mode, "legacy");
});

await scenario("live reload: a fresh in-session user title still outranks native detection", async () => {
  const harness = createB0Harness({ flag: true, store: "none" });
  const chatId = harness.api.getState().chatId;
  harness.setSidebarReaderFixture("Native sidebar value", "");
  harness.api.setTitle({
    chatId,
    baseTitle: "User chosen in session",
    source: "user",
    priority: 100,
    confidence: 1,
  }, { force: true, userInitiated: true, reason: "stage1f-user-precedence" });

  harness.hook.detectTitles("stage1f-user-precedence-detect");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, "User chosen in session");
});

await scenario("live reload: store rejection and unavailability both leave a current boot record", async () => {
  const rejected = createB0Harness({ flag: true });
  const rejectedChatId = rejected.api.getState().chatId;
  rejected.runTimers("timeout");
  await flushMicrotasks(8);
  rejected.failNextPersist("bridge timeout (1500ms)");
  await seedConfirmedUserTitle(rejected, `${RELOAD_EMOJI} ${RELOAD_NEW_BASE}`, "stage1f-reject-write");
  await flushMicrotasks(8);
  const rejectedCache = readBootCacheRecord(rejected, rejectedChatId);
  assert(rejectedCache, "rejected persist must still leave a boot record");
  assert.equal(rejectedCache.state.baseTitle, RELOAD_NEW_BASE);

  const unavailable = createB0Harness({ flag: true, store: "none" });
  const unavailableChatId = unavailable.api.getState().chatId;
  await seedConfirmedUserTitle(unavailable, `${RELOAD_EMOJI} ${RELOAD_NEW_BASE}`, "stage1f-unavailable-write");
  await flushMicrotasks(8);
  const unavailableCache = readBootCacheRecord(unavailable, unavailableChatId);
  assert(unavailableCache, "unavailable Store must still leave a boot record");
  assert.equal(unavailableCache.state.baseTitle, RELOAD_NEW_BASE);
  assert.equal(unavailable.api.selfCheck().durability.durable, false);
});

/* ── Stage 1F Store-vs-boot-cache freshness regression ─────────────────────
   Live sequence: the durable Store held an older confirmed title while the
   boot cache and the native row already held a newer one. Equal user priority
   let the late Store hydration overwrite the newer record, and the restored
   record was no longer reconcilable, so current native truth could not
   recover canonical state. */

const FRESH_OLD_BASE = "Title Canary Gamma - Delta";
const FRESH_NEW_BASE = "Title Canary Epsilon - Zeta";
const FRESH_EMOJI = "🔶";
const FRESH_NEW_DISPLAY = `${FRESH_EMOJI} ${FRESH_NEW_BASE}`;
const FRESH_T_OLD = 1785426477911;
const FRESH_T_NEW = 1785440877911;

function persistedTitleRecord(chatId, baseTitle, updatedAt) {
  return {
    version: 1,
    chatId,
    baseTitle,
    source: "user",
    priority: 100,
    confidence: 1,
    emoji: FRESH_EMOJI,
    emojiSource: "native-title",
    emojiPriority: 90,
    emojiConfidence: 0.95,
    updatedAt,
    emojiUpdatedAt: 1785239809513,
  };
}

function bootCacheSeedAt(chatId, baseTitle, updatedAt) {
  return {
    [bootCacheKeyFor(chatId)]: JSON.stringify({
      version: 1,
      chatId,
      state: persistedTitleRecord(chatId, baseTitle, updatedAt),
      updatedAt: updatedAt + 10,
      expiresAt: updatedAt + 604800000,
    }),
  };
}

async function hydrateWithStoreRecord(harness, chatId, storeRecord) {
  harness.setStoreRecord(storageKeyFor(chatId), storeRecord);
  harness.runTimers("timeout");
  await flushMicrotasks(12);
}

function storageKeyFor(chatId) {
  return `h2o:prm:cgx:library:chat-title:state:v1:${chatId}`;
}

await scenario("live reload: an older Store record cannot overwrite a newer boot cache", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = createB0Harness({
    flag: true,
    documentTitle: `${FRESH_NEW_BASE} - ChatGPT`,
    storageSeed: bootCacheSeedAt(chatId, FRESH_NEW_BASE, FRESH_T_NEW),
  });
  harness.setRoute(`/c/${chatId}`);
  harness.setSidebarReaderFixture(FRESH_NEW_BASE, "");
  harness.api.refresh("stage1f-store-freshness-boot");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, FRESH_NEW_BASE);

  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, FRESH_OLD_BASE, FRESH_T_OLD));

  const state = harness.api.getState();
  assert.equal(state.baseTitle, FRESH_NEW_BASE, "older Store record must not defeat the newer cache");
  assert.equal(state.emoji, FRESH_EMOJI);
  assert.equal(state.displayTitle, FRESH_NEW_DISPLAY);
  assert.equal(readBootCacheRecord(harness, chatId).state.baseTitle, FRESH_NEW_BASE);

  // repeated native detection must not oscillate
  harness.hook.detectTitles("stage1f-store-freshness-repeat-1");
  harness.hook.detectTitles("stage1f-store-freshness-repeat-2");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, FRESH_NEW_BASE);
  assert.equal(readBootCacheRecord(harness, chatId).state.baseTitle, FRESH_NEW_BASE);
  assert.equal(harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);
  assert.equal(recordFor(harness, "stage1e-chat-b"), null);
});

await scenario("live reload: a genuinely newer Store record still wins", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = createB0Harness({
    flag: true,
    documentTitle: `${FRESH_OLD_BASE} - ChatGPT`,
    storageSeed: bootCacheSeedAt(chatId, FRESH_OLD_BASE, FRESH_T_OLD),
  });
  harness.setRoute(`/c/${chatId}`);
  harness.setSidebarReaderFixture(FRESH_OLD_BASE, "");
  harness.api.refresh("stage1f-store-newer-boot");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, FRESH_OLD_BASE);

  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, FRESH_NEW_BASE, FRESH_T_NEW));
  assert.equal(harness.api.getState().baseTitle, FRESH_NEW_BASE, "newer Store record must win");
  assert.equal(harness.api.getState().emoji, FRESH_EMOJI);
});

await scenario("live reload: equal freshness keeps the incumbent deterministically", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = createB0Harness({
    flag: true,
    documentTitle: "ChatGPT",
    storageSeed: bootCacheSeedAt(chatId, FRESH_NEW_BASE, FRESH_T_NEW),
  });
  harness.setRoute(`/c/${chatId}`);
  harness.setSidebarReaderFixture("", "");
  harness.api.refresh("stage1f-store-equal-boot");
  await flushMicrotasks(8);

  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, FRESH_OLD_BASE, FRESH_T_NEW));
  assert.equal(harness.api.getState().baseTitle, FRESH_NEW_BASE);
  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, FRESH_OLD_BASE, FRESH_T_NEW));
  assert.equal(harness.api.getState().baseTitle, FRESH_NEW_BASE, "equal freshness must not oscillate");
});

await scenario("live reload: stale Store hydration is reconciled once by exact-route native truth", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = createB0Harness({
    flag: true,
    documentTitle: `${FRESH_NEW_BASE} - ChatGPT`,
    storageSeed: null,
  });
  harness.setRoute(`/c/${chatId}`);
  harness.setSidebarReaderFixture(FRESH_NEW_BASE, "");
  harness.api.refresh("stage1f-store-reconcile-boot");
  await flushMicrotasks(8);
  // no cache at all: the only startup record comes from a stale Store
  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, FRESH_OLD_BASE, FRESH_T_OLD));
  harness.hook.detectTitles("stage1f-store-reconcile");
  await flushMicrotasks(8);

  const state = harness.api.getState();
  assert.equal(state.baseTitle, FRESH_NEW_BASE, "exact-route native truth must reconcile a stale Store record");
  assert.equal(state.emoji, FRESH_EMOJI);
  assert.equal(state.displayTitle, FRESH_NEW_DISPLAY);
  assert.equal(harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);
});

await scenario("live reload: wrong-route and wrong-chat native titles never reconcile", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = createB0Harness({
    flag: true,
    documentTitle: `${FRESH_NEW_BASE} - ChatGPT`,
    storageSeed: bootCacheSeedAt(chatId, FRESH_OLD_BASE, FRESH_T_OLD),
  });
  harness.setRoute(`/c/${chatId}`);
  harness.setSidebarReaderFixture("", "");
  harness.api.refresh("stage1f-wrong-route-boot");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, FRESH_OLD_BASE);

  // a transient non-chat route carries no exact-route native truth, so the
  // restored record must survive it untouched
  harness.setRoute("/");
  harness.setSidebarReaderFixture(FRESH_NEW_BASE, "");
  harness.api.refresh("stage1f-wrong-route");
  await flushMicrotasks(8);
  assert.equal(recordFor(harness, chatId)?.baseTitle ?? null, FRESH_OLD_BASE);

  harness.setRoute(`/c/${chatId}`);
  harness.setSidebarReaderFixture("", "");
  harness.api.refresh("stage1f-empty-native");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, FRESH_OLD_BASE, "empty native text must not reconcile");
});

await scenario("live reload: interrupted and completed Store writes both stay recoverable", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  // interrupted: Store write never lands, but the boot cache already carries it
  const interrupted = createB0Harness({ flag: true, store: "none", documentTitle: `${FRESH_NEW_BASE} - ChatGPT` });
  interrupted.setRoute(`/c/${chatId}`);
  interrupted.api.setTitle({
    chatId,
    baseTitle: FRESH_NEW_BASE,
    source: "user",
    priority: 100,
    confidence: 1,
  }, { force: true, userInitiated: true, reason: "stage1f-interrupted-write" });
  await flushMicrotasks(8);
  assert.equal(readBootCacheRecord(interrupted, chatId).state.baseTitle, FRESH_NEW_BASE);
  assert.equal(interrupted.api.selfCheck().durability.durable, false);

  // completed: durable Store write also mirrors into the boot cache
  const completed = createB0Harness({ flag: true, documentTitle: `${FRESH_NEW_BASE} - ChatGPT` });
  completed.setRoute(`/c/${chatId}`);
  completed.runTimers("timeout");
  await flushMicrotasks(8);
  completed.api.setTitle({
    chatId,
    baseTitle: FRESH_NEW_BASE,
    source: "user",
    priority: 100,
    confidence: 1,
  }, { force: true, userInitiated: true, reason: "stage1f-completed-write" });
  await flushMicrotasks(8);
  assert.equal(readBootCacheRecord(completed, chatId).state.baseTitle, FRESH_NEW_BASE);
  assert.equal(completed.storeSetCalls() >= 1, true);
});

// Stage 1F live canary: after a reload the exact-route sidebar row can still be
// rendering ChatGPT's pre-reload cached title for a few frames. That stale value
// differs from the restored record exactly as a current one would, so startup
// reconciliation must not be spent on it.
const STARTUP_STALE_BASE = FRESH_NEW_BASE;
const STARTUP_CURRENT_BASE = "Title Canary Eta - Theta";
const STARTUP_CURRENT_DISPLAY = `${FRESH_EMOJI} ${STARTUP_CURRENT_BASE}`;

function startupHarness(chatId) {
  // boot cache holds the newest persisted title; the Store lags behind it
  const harness = createB0Harness({
    flag: true,
    documentTitle: `${STARTUP_STALE_BASE} - ChatGPT`,
    storageSeed: bootCacheSeedAt(chatId, STARTUP_CURRENT_BASE, FRESH_T_NEW),
  });
  harness.setRoute(`/c/${chatId}`);
  return harness;
}

await scenario("live reload: a stale startup sidebar row cannot capture the restored record", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = startupHarness(chatId);
  // the row still shows ChatGPT's pre-reload cached title
  const fixture = harness.setSidebarReaderFixture(STARTUP_STALE_BASE, "");
  harness.api.refresh("stage1f-startup-stale-row");
  await flushMicrotasks(8);
  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, STARTUP_STALE_BASE, FRESH_T_OLD));
  const captured = recordFor(harness, chatId);
  assert.equal(
    captured.restoredFromPersistence,
    true,
    "a stale startup row must not consume restored-persistence reconciliation",
  );

  // React replaces the row with the real current title
  fixture.native.textContent = STARTUP_CURRENT_BASE;
  harness.api.refresh("stage1f-startup-row-settled");
  await flushMicrotasks(8);

  const state = harness.api.getState();
  assert.equal(state.baseTitle, STARTUP_CURRENT_BASE, "the settled native title must still win");
  assert.equal(state.emoji, FRESH_EMOJI, "emoji stays separately stored");
  assert.equal(state.displayTitle, STARTUP_CURRENT_DISPLAY);
  assert.equal(readBootCacheRecord(harness, chatId).state.baseTitle, STARTUP_CURRENT_BASE);
  assert.equal(harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);

  // a late stale Store read must not revert the reconciled title
  await hydrateWithStoreRecord(harness, chatId, persistedTitleRecord(chatId, STARTUP_STALE_BASE, FRESH_T_OLD));
  assert.equal(harness.api.getState().baseTitle, STARTUP_CURRENT_BASE, "older Store data must not regain authority");
});

await scenario("live reload: an absent startup sidebar row defers reconciliation to the mounted row", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = startupHarness(chatId);
  harness.api.refresh("stage1f-startup-no-row");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, STARTUP_CURRENT_BASE);
  assert.equal(recordFor(harness, chatId).restoredFromPersistence, true);

  const fixture = harness.setSidebarReaderFixture(STARTUP_STALE_BASE, "");
  harness.api.refresh("stage1f-startup-row-mounted-stale");
  await flushMicrotasks(8);
  fixture.native.textContent = STARTUP_CURRENT_BASE;
  harness.api.refresh("stage1f-startup-row-mounted-current");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, STARTUP_CURRENT_BASE);
});

await scenario("live reload: H2O-owned document titles never reconcile a restored record", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = startupHarness(chatId);
  harness.setSidebarReaderFixture("", "");
  harness.api.refresh("stage1f-owned-doc-boot");
  await flushMicrotasks(8);

  // 9B1a composes and writes the canonical display, then declares the own write
  const composed = `${FRESH_EMOJI} ${STARTUP_STALE_BASE}`;
  harness.api.markDocumentTitleWrite(composed, { source: "tab-title" });
  harness.setDocumentTitle(composed);
  harness.api.refresh("stage1f-owned-doc-readback");
  await flushMicrotasks(8);

  assert.equal(harness.api._isOwnDocumentTitle(composed), true, "own-write tracking must recognise the write");
  const rec = recordFor(harness, chatId);
  assert.equal(rec.baseTitle, STARTUP_CURRENT_BASE, "H2O's own document title must not become canonical state");
  assert.equal(rec.source, "user", "an own document title must not change provenance");
  assert.equal(rec.restoredFromPersistence, true, "an own document title must not consume reconciliation");
});

await scenario("live reload: a non-owned same-value document title never reconciles", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = startupHarness(chatId);
  harness.setSidebarReaderFixture("", "");
  harness.api.refresh("stage1f-foreign-doc-boot");
  await flushMicrotasks(8);
  const before = recordFor(harness, chatId);

  harness.setDocumentTitle(`${STARTUP_CURRENT_BASE} - ChatGPT`);
  harness.api.refresh("stage1f-foreign-doc-readback");
  await flushMicrotasks(8);

  const after = recordFor(harness, chatId);
  assert.equal(after.baseTitle, STARTUP_CURRENT_BASE);
  assert.equal(after.source, before.source, "a same-value document read must not change provenance");
  assert.equal(after.updatedAt, before.updatedAt, "a same-value document read must not restamp");
  assert.equal(after.restoredFromPersistence, true, "a document read must never consume reconciliation");
});

await scenario("live reload: repeated settled native observations cause no churn or oscillation", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = startupHarness(chatId);
  const fixture = harness.setSidebarReaderFixture(STARTUP_STALE_BASE, "");
  harness.api.refresh("stage1f-churn-stale");
  await flushMicrotasks(8);
  fixture.native.textContent = STARTUP_CURRENT_BASE;
  harness.api.refresh("stage1f-churn-settled");
  await flushMicrotasks(8);
  const settled = recordFor(harness, chatId);

  for (const reason of ["stage1f-churn-a", "stage1f-churn-b", "stage1f-churn-c"]) {
    harness.api.refresh(reason);
    await flushMicrotasks(8);
  }
  const repeated = recordFor(harness, chatId);
  assert.equal(repeated.baseTitle, STARTUP_CURRENT_BASE);
  assert.equal(repeated.updatedAt, settled.updatedAt, "repeated identical native reads must not restamp");
  assert.equal(repeated.rev, settled.rev, "repeated identical native reads must not bump the revision");
});

await scenario("live reload: a live in-session rename ends restored reconciliation", async () => {
  const chatId = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
  const harness = startupHarness(chatId);
  const fixture = harness.setSidebarReaderFixture(STARTUP_STALE_BASE, "");
  harness.api.refresh("stage1f-live-rename-boot");
  await flushMicrotasks(8);

  harness.api.setTitle({
    chatId,
    baseTitle: FRESH_OLD_BASE,
    source: "user",
    priority: 100,
    confidence: 1,
  }, { force: true, userInitiated: true, reason: "stage1f-live-rename" });
  await flushMicrotasks(8);
  assert.equal(recordFor(harness, chatId).restoredFromPersistence, false, "a live authorship ends the restored phase");

  // ordinary native observations must no longer outrank the live user title
  fixture.native.textContent = STARTUP_CURRENT_BASE;
  harness.api.refresh("stage1f-live-rename-native");
  await flushMicrotasks(8);
  assert.equal(harness.api.getState().baseTitle, FRESH_OLD_BASE, "a fresh in-session title still outranks native");
});

// Stage 1F permanent product contract: the H2O emoji is part of the visible
// title on every visible surface while the runtime is active. The convergence
// flag governs title authority, not whether the emoji is rendered. The passive
// legacy presentation exists solely to carry the emoji the native node cannot,
// so with no emoji H2O still releases the surface entirely.
const VIS_BASE = "Title Canary Eta - Theta";
const VIS_EMOJI = "🔶";
const VIS_DISPLAY = `${VIS_EMOJI} ${VIS_BASE}`;
const VIS_RENAME_BASE = "Title Canary Iota - Kappa";
const VIS_RENAME_DISPLAY = `${VIS_EMOJI} ${VIS_RENAME_BASE}`;
const LEGACY_MODE = { enabled: false, mode: "legacy" };
const CANONICAL_MODE = { enabled: true, mode: "canonical" };

function visibleSidebar(overrides = {}) {
  const harness = createSidebarHarness({
    baseTitle: VIS_BASE,
    emoji: VIS_EMOJI,
    displayTitle: VIS_DISPLAY,
    documentTitle: VIS_DISPLAY,
    convergence: LEGACY_MODE,
    ...overrides,
  });
  // the native row always carries the clean base title, never the display title
  const row = harness.createRow({ nativeTitle: overrides.baseTitle ?? VIS_BASE });
  harness.evaluate();
  harness.runFrames();
  return { harness, row };
}

function ownedVisuals(harness, row) {
  return row.anchor
    .querySelectorAll('[data-h2o-owner="title-sidebar-renderer"][data-h2o-title-role="visual"]')
    .length;
}

await scenario("visible contract: legacy sidebar renders the emoji without owning authority", () => {
  const { harness, row } = visibleSidebar();
  const visual = harness.visual(row);
  assert.notEqual(visual, null, "legacy mode must still present the canonical display");
  assert.equal(visual.textContent, VIS_DISPLAY);
  assert.equal(ownedVisuals(harness, row), 1, "exactly one H2O visual title");
  // the native node is hidden, never overwritten or removed
  assert.equal(row.source.isConnected, true);
  assert.equal(row.source.textContent, VIS_BASE, "native node keeps the byte-exact clean base");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), "1");
  assert.equal(row.anchor.getAttribute("aria-labelledby"), visual.id);
  assert.equal(harness.mutations.patches, 0, "no PATCH from the sidebar");
  assert.equal(harness.mutations.storeWrites, 0, "no persistence from the sidebar");
  assert.equal(harness.mutations.canonical, 0, "no canonical state ownership");
});

await scenario("visible contract: legacy sidebar diagnostics report passive presentation", () => {
  const { harness } = visibleSidebar();
  const legacy = harness.runtime().diagnose();
  assert.equal(legacy.presentationMode, "legacy", "diagnostics must not claim canonical authority");
  assert.equal(legacy.phase, "legacy-adopted");

  harness.emit({ convergence: CANONICAL_MODE });
  harness.runFrames();
  const canonical = harness.runtime().diagnose();
  assert.equal(canonical.presentationMode, "canonical");
  assert.equal(canonical.phase, "adopted");
});

await scenario("visible contract: emoji survives legacy to canonical to legacy toggling", () => {
  const { harness, row } = visibleSidebar();
  assert.equal(harness.visual(row).textContent, VIS_DISPLAY);

  harness.emit({ convergence: CANONICAL_MODE });
  harness.runFrames();
  assert.equal(harness.visual(row).textContent, VIS_DISPLAY);
  assert.equal(ownedVisuals(harness, row), 1);

  harness.emit({ convergence: LEGACY_MODE });
  harness.runFrames();
  assert.equal(harness.visual(row).textContent, VIS_DISPLAY, "rollback must retain the emoji");
  assert.equal(ownedVisuals(harness, row), 1, "toggling must not duplicate the visual");
  assert.equal(row.source.textContent, VIS_BASE);
});

await scenario("visible contract: legacy rename re-renders one visual with the emoji", () => {
  const { harness, row } = visibleSidebar();
  harness.emit({
    baseTitle: VIS_RENAME_BASE,
    displayTitle: VIS_RENAME_DISPLAY,
    documentTitle: VIS_RENAME_DISPLAY,
  });
  harness.runFrames();
  assert.equal(harness.visual(row).textContent, VIS_RENAME_DISPLAY);
  assert.equal(ownedVisuals(harness, row), 1);
  assert.equal(harness.mutations.patches, 0);
});

await scenario("visible contract: canonical rename then rollback keeps the rendered emoji", () => {
  const { harness, row } = visibleSidebar({ convergence: CANONICAL_MODE });
  harness.emit({
    baseTitle: VIS_RENAME_BASE,
    displayTitle: VIS_RENAME_DISPLAY,
    documentTitle: VIS_RENAME_DISPLAY,
  });
  harness.runFrames();
  assert.equal(harness.visual(row).textContent, VIS_RENAME_DISPLAY);

  harness.emit({ convergence: LEGACY_MODE });
  harness.runFrames();
  assert.equal(harness.visual(row).textContent, VIS_RENAME_DISPLAY);
  assert.equal(row.source.textContent, VIS_BASE, "native text is never rewritten by the renderer");
});

await scenario("visible contract: repeated scans and remounts never duplicate the legacy visual", () => {
  const { harness, row } = visibleSidebar();
  for (let i = 0; i < 3; i += 1) {
    harness.triggerMutation();
    harness.runFrames();
  }
  assert.equal(ownedVisuals(harness, row), 1);
  harness.emit({ routeToken: 2 });
  harness.runFrames();
  assert.equal(ownedVisuals(harness, row), 1, "a route-token bump must not duplicate the visual");
  assert.equal(harness.visual(row).textContent, VIS_DISPLAY);
});

await scenario("visible contract: legacy presentation releases cleanly on teardown", () => {
  const { harness, row } = visibleSidebar();
  const visualId = harness.visual(row).id;
  harness.destroy();
  assert.equal(harness.visual(row), null, "teardown removes the H2O visual");
  assert.equal(row.source.textContent, VIS_BASE, "native base title is the safe fallback");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-owner"), null);
  assert.equal(row.anchor.hasAttribute("data-h2o-title-sidebar-adopted"), false);
  assert.equal(row.anchor.getAttribute("aria-labelledby"), null, "no stale owned aria after teardown");
  assert.notEqual(visualId, undefined);
});

await scenario("visible contract: without an emoji legacy mode still releases the sidebar", () => {
  const { harness, row } = visibleSidebar({
    emoji: "",
    displayTitle: VIS_BASE,
    documentTitle: VIS_BASE,
    convergence: CANONICAL_MODE,
  });
  assert.notEqual(harness.visual(row), null);
  harness.emit({ convergence: LEGACY_MODE });
  harness.runFrames();
  assert.equal(harness.visual(row), null, "no emoji means nothing to present in legacy mode");
  assert.equal(row.source.textContent, VIS_BASE);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.innerText.startsWith(" "), false, "no leading whitespace or placeholder");
});

await scenario("visible contract: complex emoji stay byte-exact at the start of the sidebar title", () => {
  const complex = [
    ["flag", "🇯🇵"],
    ["zwj", "👩‍💻"],
    ["skin-tone", "👍🏽"],
    ["variation-selector", "❤️"],
  ];
  for (const [label, emoji] of complex) {
    const display = `${emoji} ${VIS_BASE}`;
    const { harness, row } = visibleSidebar({ emoji, displayTitle: display, documentTitle: display });
    const visual = harness.visual(row);
    assert.notEqual(visual, null, `${label} emoji must render in legacy mode`);
    assert.equal(visual.textContent, display, `${label} emoji must stay byte-exact`);
    assert.equal(visual.textContent.startsWith(emoji), true, `${label} emoji must lead the title`);
    assert.equal(row.source.textContent, VIS_BASE);
  }
});

await scenario("visible contract: RTL titles keep the emoji leading in legacy mode", () => {
  const rtlBase = "لوحة العنوان";
  const rtlDisplay = `${VIS_EMOJI} ${rtlBase}`;
  const { harness, row } = visibleSidebar({
    baseTitle: rtlBase,
    displayTitle: rtlDisplay,
    documentTitle: rtlDisplay,
  });
  const visual = harness.visual(row);
  assert.equal(visual.textContent, rtlDisplay);
  assert.equal(visual.getAttribute("dir"), "auto", "bidi isolation is preserved");
  assert.equal(row.source.textContent, rtlBase);
});

await scenario("visible contract: legacy sidebar never adopts a wrong-chat row", () => {
  const { harness } = visibleSidebar();
  const foreign = harness.createRow({ nativeTitle: "Foreign chat", href: "/c/stage1eb-chat-z" });
  harness.runFrames();
  assert.equal(harness.visual(foreign), null, "exact-route identity still gates adoption");
  assert.equal(foreign.source.textContent, "Foreign chat");
});

await scenario("visible contract: legacy browser tab keeps the emoji against native overwrites", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: VIS_BASE,
    emoji: VIS_EMOJI,
    displayTitle: VIS_DISPLAY,
    documentTitle: VIS_DISPLAY,
    convergence: LEGACY_MODE,
  });
  harness.evaluate();
  assert.equal(harness.document.title, VIS_DISPLAY, "legacy tab must render the emoji");

  harness.document.title = `${VIS_BASE} - ChatGPT`;
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, VIS_DISPLAY, "a native overwrite must be reasserted in legacy mode");
});

await scenario("visible contract: legacy browser tab without an emoji yields to native", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: VIS_BASE,
    emoji: "",
    displayTitle: VIS_BASE,
    documentTitle: VIS_BASE,
    convergence: LEGACY_MODE,
  });
  harness.evaluate();
  assert.equal(harness.document.title, VIS_BASE);
  harness.document.title = "Native rewrite - ChatGPT";
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, "Native rewrite - ChatGPT", "nothing to add means no contest");
});

await scenario("visible contract: canonical tab rendering is unchanged by the legacy path", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: VIS_BASE,
    emoji: VIS_EMOJI,
    displayTitle: VIS_DISPLAY,
    documentTitle: VIS_DISPLAY,
    convergence: CANONICAL_MODE,
  });
  harness.evaluate();
  assert.equal(harness.document.title, VIS_DISPLAY);
  assert.equal(harness.titleAssignments(), 1);
  harness.document.title = "Native overwrite - ChatGPT";
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, VIS_DISPLAY);
});

// Stage 1F default-on: the validated three-surface presentation ships enabled.
// The flag survives purely as an emergency rollback control, so an explicitly
// stored false must still win and must never be migrated to true.
await scenario("default on: a profile with no stored override resolves to canonical", () => {
  const harness = createB0Harness({ flag: "unset" });
  const convergence = harness.api.getState().convergence;
  assert.equal(convergence.requested, true);
  assert.equal(convergence.enabled, true);
  assert.equal(convergence.mode, "canonical");
  assert.equal(convergence.gate, "ok");
  // default-on must be a read-time default, never a boot-time write
  assert.equal(harness.storedFlag().present, false, "the default must not be persisted at boot");
});

await scenario("default on: an explicit stored false still wins and is never migrated", () => {
  const harness = createB0Harness({ flag: false });
  const convergence = harness.api.getState().convergence;
  assert.equal(convergence.requested, false);
  assert.equal(convergence.enabled, false);
  assert.equal(convergence.mode, "legacy");
  assert.equal(convergence.gate, "not-requested");
  const stored = harness.storedFlag();
  assert.equal(stored.present, true);
  assert.equal(stored.value, false, "an explicit false must not be rewritten to true");
});

await scenario("default on: emoji stays visible on every surface with an explicit false", () => {
  const harness = createB0Harness({ flag: false });
  const chatId = harness.api.getState().chatId;
  harness.api.setTitle({
    chatId,
    baseTitle: VIS_BASE,
    source: "user",
    priority: 100,
    confidence: 1,
  }, { force: true, userInitiated: true, reason: "default-on-legacy-seed" });
  harness.api.setEmoji({ chatId, emoji: VIS_EMOJI, source: "user", priority: 100 }, { force: true });
  const state = harness.api.getState();
  assert.equal(state.convergence.mode, "legacy");
  assert.equal(state.displayTitle, VIS_DISPLAY, "under-input consumes displayTitle");
  assert.equal(state.documentTitle, VIS_DISPLAY, "tab consumes documentTitle");
  const sidebar = visibleSidebar({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(sidebar.harness.visual(sidebar.row).textContent, VIS_DISPLAY);
  assert.equal(sidebar.harness.runtime().diagnose().presentationMode, "legacy");
  assert.equal(sidebar.harness.runtime().diagnose().phase, "legacy-adopted");
});

await scenario("default on: an unset override is distinguishable from every malformed value", () => {
  assert.equal(createB0Harness({ flag: "unset" }).api.getState().convergence.mode, "canonical");
  assert.equal(createB0Harness({ flag: true }).api.getState().convergence.mode, "canonical");
  assert.equal(createB0Harness({ flag: false }).api.getState().convergence.mode, "legacy");
  for (const malformed of ["0", "false", 0, 1, null, {}]) {
    const harness = createB0Harness({ flag: malformed });
    const convergence = harness.api.getState().convergence;
    assert.equal(convergence.mode, "legacy-fallback", `malformed ${JSON.stringify(malformed)} must fail closed`);
    assert.equal(convergence.source, "invalid-feature-flag");
    assert.equal(convergence.enabled, false);
  }
  // an explicitly stored undefined is an absent decision, so the default applies
  const undefinedOverride = createB0Harness({ flag: false });
  assert.equal(undefinedOverride.api.getState().convergence.mode, "legacy");
  undefinedOverride.setRuntimeFlag(undefined);
  assert.equal(undefinedOverride.storedFlag().present, true);
  assert.equal(undefinedOverride.api.getState().convergence.mode, "canonical");
});

await scenario("default on: runtime false rolls back to legacy and runtime true restores canonical", () => {
  const harness = createB0Harness({ flag: "unset" });
  assert.equal(harness.api.getState().convergence.mode, "canonical");

  // the CAS-wrapped flags.set must self-reproject without debug.refreshDisplay
  harness.setRuntimeFlag(false);
  const rolledBack = harness.api.getState().convergence;
  assert.equal(rolledBack.requested, false);
  assert.equal(rolledBack.enabled, false);
  assert.equal(rolledBack.mode, "legacy");
  assert.equal(harness.storedFlag().value, false);

  harness.setRuntimeFlag(true);
  const restored = harness.api.getState().convergence;
  assert.equal(restored.requested, true);
  assert.equal(restored.enabled, true);
  assert.equal(restored.mode, "canonical");
  assert.equal(restored.gate, "ok");
  assert.equal(harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);
});

await scenario("default on: a session override still outranks the new default", () => {
  const harness = createB0Harness({ flag: "unset" });
  const chatId = harness.api.getState().chatId;
  // ordinary state changes recompose the snapshot; no debug reprojection needed
  const touch = (reason, baseTitle) => harness.api.setTitle({
    chatId,
    baseTitle,
    source: "user",
    priority: 100,
    confidence: 1,
  }, { force: true, userInitiated: true, reason });

  harness.setSessionOverride(false);
  touch("default-on-session-override", "Session Override A");
  const state = harness.api.getState();
  assert.equal(state.convergence.mode, "legacy");
  assert.equal(state.convergence.source, "session-override");

  harness.setSessionOverride(undefined);
  touch("default-on-session-cleared", "Session Override B");
  assert.equal(harness.api.getState().convergence.mode, "canonical");
  assert.equal(harness.api.getState().convergence.source, "feature-flags");
});

await scenario("default on: toggling from the default keeps exactly one sidebar visual", () => {
  const { harness, row } = visibleSidebar({ convergence: { enabled: true, mode: "canonical" } });
  const firstId = harness.visual(row).id;
  assert.equal(harness.runtime().diagnose().presentationMode, "canonical");

  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  harness.runFrames();
  assert.equal(ownedVisuals(harness, row), 1, "rollback must not duplicate the visual");
  assert.equal(harness.visual(row).id, firstId, "no aria churn or ownership hand-off");
  assert.equal(row.anchor.getAttribute("aria-labelledby"), firstId);
  assert.equal(row.source.textContent, VIS_BASE, "native node stays clean");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), "1");

  harness.emit({ convergence: { enabled: true, mode: "canonical" } });
  harness.runFrames();
  assert.equal(ownedVisuals(harness, row), 1);
  assert.equal(harness.visual(row).id, firstId);
  assert.equal(harness.runtime().diagnose().presentationMode, "canonical");
  assert.equal(harness.mutations.patches, 0);
  assert.equal(harness.mutations.storeWrites, 0);
});

// 9B0a runs at document-start, before 0F1k creates H2O.flags, and the registry
// creation path dispatches no readiness event. Until the hook first attaches
// there is no observable moment at which the registry became real, so a clean
// profile stayed legacy forever despite the shipped default.
function lateRegistryHarness(options = {}) {
  // no durable Store: readiness is then the only thing that can recompose the
  // snapshot, so these scenarios cannot pass on an unrelated notification.
  const harness = createB0Harness({ flagsRegistry: "late", store: "none", ...options });
  const published = [];
  harness.api.subscribe((_state, payload) => {
    published.push({
      reason: String(payload?.reason || ""),
      convergence: { ...(payload?.convergence || {}) },
    });
  });
  published.length = 0;
  return { harness, published };
}

await scenario("flags readiness: boot before the registry fails closed and settles once it appears", () => {
  const { harness, published } = lateRegistryHarness({ flag: "unset" });
  assert.equal(harness.flagsRegistryPresent(), false, "9B0a must boot before H2O.flags exists");
  const booted = harness.api.getState().convergence;
  assert.equal(booted.requested, false, "an unavailable registry must fail closed");
  assert.equal(booted.enabled, false);
  assert.equal(booted.mode, "legacy");
  assert.equal(booted.source, "default");
  assert.equal(booted.gate, "not-requested");

  // 0F1k appears with no stored Title key and no readiness event
  harness.installFlagsRegistry();
  assert.equal(harness.storedFlag().present, false);
  harness.runTimers("timeout");

  const settled = harness.api.getState().convergence;
  assert.equal(settled.requested, true, "the shipped default must apply once the registry is real");
  assert.equal(settled.enabled, true);
  assert.equal(settled.mode, "canonical");
  assert.equal(settled.gate, "ok");
  assert.equal(settled.source, "feature-flags");
  const readiness = published.filter((entry) => entry.reason === "convergence-flags-ready");
  assert.equal(readiness.length, 1, "readiness must reproject exactly once");
  // consumers must receive the corrected convergence, not merely see it later
  assert.equal(readiness[0].convergence.requested, true);
  assert.equal(readiness[0].convergence.enabled, true);
  assert.equal(readiness[0].convergence.mode, "canonical");
  assert.equal(readiness[0].convergence.gate, "ok");
  assert.equal(harness.storedFlag().present, false, "readiness must not write a flag value");
  assert.equal(harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);
});

await scenario("flags readiness: a late registry with an explicit stored false stays legacy", () => {
  const { harness } = lateRegistryHarness({ flag: false });
  harness.installFlagsRegistry();
  harness.runTimers("timeout");
  const settled = harness.api.getState().convergence;
  assert.equal(settled.requested, false);
  assert.equal(settled.enabled, false);
  assert.equal(settled.mode, "legacy");
  const stored = harness.storedFlag();
  assert.equal(stored.present, true);
  assert.equal(stored.value, false, "an explicit false must never be migrated by readiness");
});

await scenario("flags readiness: a late malformed value stays fail-closed", () => {
  for (const malformed of ["0", null, 1]) {
    const { harness } = lateRegistryHarness({ flag: malformed });
    harness.installFlagsRegistry();
    harness.runTimers("timeout");
    const settled = harness.api.getState().convergence;
    assert.equal(settled.mode, "legacy-fallback", `late ${JSON.stringify(malformed)} must fail closed`);
    assert.equal(settled.source, "invalid-feature-flag");
    assert.equal(settled.enabled, false);
  }
});

await scenario("flags readiness: retries before the registry exists change nothing and never duplicate", () => {
  const { harness, published } = lateRegistryHarness({ flag: "unset" });
  // the attach retry keeps rescheduling while the registry is still missing
  for (let i = 0; i < 3; i += 1) harness.runTimers("timeout");
  assert.equal(harness.api.getState().convergence.mode, "legacy");
  assert.equal(published.filter((entry) => entry.reason === "convergence-flags-ready").length, 0);

  harness.installFlagsRegistry();
  for (let i = 0; i < 3; i += 1) harness.runTimers("timeout");
  assert.equal(harness.api.getState().convergence.mode, "canonical");
  assert.equal(
    published.filter((entry) => entry.reason === "convergence-flags-ready").length,
    1,
    "repeated readiness checks must not re-notify",
  );

  // a double-wrapped flags.set would dispatch the change event twice
  published.length = 0;
  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().convergence.mode, "legacy");
  assert.equal(
    published.filter((entry) => entry.reason === "convergence-flag-change").length,
    1,
    "flags.set must be wrapped exactly once",
  );
});

await scenario("flags readiness: ordinary flag toggling still works after a late attachment", () => {
  const { harness } = lateRegistryHarness({ flag: "unset" });
  harness.installFlagsRegistry();
  harness.runTimers("timeout");
  assert.equal(harness.api.getState().convergence.mode, "canonical");

  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().convergence.mode, "legacy");
  harness.setRuntimeFlag(true);
  const restored = harness.api.getState().convergence;
  assert.equal(restored.mode, "canonical");
  assert.equal(restored.gate, "ok");
  assert.equal(harness.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length, 0);
});

await scenario("flags readiness: teardown cancels the pending attach and blocks post-destroy reprojection", () => {
  const { harness, published } = lateRegistryHarness({ flag: "unset" });
  harness.hook.destroy();
  harness.installFlagsRegistry();
  harness.runTimers("timeout");
  assert.equal(
    published.filter((entry) => entry.reason === "convergence-flags-ready").length,
    0,
    "a destroyed coordinator must not reproject",
  );
  const pendingTimeouts = [...harness.effects.timers.values()].filter((timer) => timer.kind === "timeout");
  assert.equal(pendingTimeouts.length, 0, "teardown must leave no pending attach timer");
  // the readiness path itself must contribute nothing once destroyed; a boot
  // notification already scheduled before destroy is pre-existing behaviour and
  // is deliberately not asserted here.
  assert.equal(
    published.some((entry) => entry.reason === "convergence-flags-ready"),
    false,
    "readiness must never fire after teardown",
  );
});

structuralTest("9B0a alone owns the convergence flag key", () => {
  assert.equal(
  (b0Source.match(new RegExp(FLAG_KEY.replaceAll(".", "\\."), "gu")) || []).length >= 1,
  true,
  "9B0a must own the convergence flag",
  );
  assert.equal(b1Source.includes(FLAG_KEY), false, "9B1a must not resolve the flag independently");
  assert.equal(c1Source.includes(FLAG_KEY), false, "9C1a must not resolve the flag independently");
});
structuralTest("9C1a has no direct canonical setTitle submission", () => {
  assert.equal(/\.setTitle\s*\(/u.test(c1Source), false);
});

structuralTest("9B2a consumes canonical display without formatter authority", () => {
  assert.match(b2Source, /snapshot\.displayTitle/u);
  assert.equal(/\b(?:sanitize|formatNative|composeTitle|splitEmoji)\w*\s*\(/u.test(b2Source), false);
  assert.equal(b2Source.includes(FLAG_KEY), false);
  assert.equal(/ChatTitle\.(?:getState|setTitle|setEmoji|renameNative|refresh|refreshDisplay)\s*\(/u.test(b2Source), false);
});

structuralTest("9B2a contains no network persistence or forbidden native-text writes", () => {
  assert.equal(/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/u.test(b2Source), false);
  assert.equal(/\bStore\s*\./u.test(b2Source), false);
  assert.equal(
    /\.setAttribute\s*\(\s*['"](?:aria-label|title|data-ho-raw-title(?:-[^'"]*)?)['"]/u.test(b2Source),
    false,
  );
  assert.equal(/className\s*=\s*['"][^'"]*truncate/u.test(b2Source), false);
});

structuralTest("9B2a ownership accessibility escrow and recovery markers are explicit", () => {
  for (const marker of [
    'data-h2o-owner',
    'data-h2o-title-role',
    'data-h2o-title-chat-id',
    'data-h2o-title-route-token',
    'aria-labelledby',
    'WeakMap',
    'recoverStaleDom',
  ]) assert.equal(b2Source.includes(marker), true, `missing 9B2a marker: ${marker}`);
  assert.equal(/setAttribute\s*\(\s*['"]dir['"]\s*,\s*['"]auto['"]/u.test(b2Source), true);
});

structuralTest("loader order registers 9B2a after confirmed consumers and before disabled 9D1a", () => {
  const order = fs.readFileSync(path.join(ROOT, DEV_ORDER_REL), "utf8").split(/\r?\n/u);
  const b0 = order.findIndex((line) => line.includes("9B0a."));
  const b1 = order.findIndex((line) => line.includes("9B1a."));
  const c1 = order.findIndex((line) => line.includes("9C1a."));
  const b2 = order.findIndex((line) => line.includes("9B2a."));
  const d1 = order.findIndex((line) => line.includes("9D1a."));
  assert(b0 < b1 && b1 < c1 && c1 < b2 && b2 < d1);
  assert.match(order[b2], /^🟢\t/u);
  assert.match(order[d1], /^🔴\t/u);
  const deps = JSON.parse(fs.readFileSync(path.join(ROOT, LOADER_DEPS_REL), "utf8"));
  const spec = deps.scripts["9B2a._Sidebar_Title_Renderer_.js"];
  assert.deepEqual(spec.dependsOn, ["9B0a._Chat_Title_State_.js"]);
  assert.deepEqual(spec.after, ["9B1a._Tab_Title_.js", "9C1a._Title_Under_Input_bar_.js"]);
  assert.deepEqual(
    deps.scripts["9D1a._Auto_Emoji_Title_.js"].after,
    ["9C1a._Title_Under_Input_bar_.js"],
    "disabled 9D1a ordering must remain independent of 9B2a",
  );
});

structuralTest("native reader extraction slices remain byte-pinned", () => {
  for (const [key, expected] of Object.entries(EXPECTED_READER_SLICE_SHA256)) {
    assert.equal(sha256(readerSlices[key]), expected, `${key} extraction slice changed`);
  }
  for (const [relative, expectedBlob] of Object.entries(EXPECTED_READER_BLOBS)) {
    assert.equal(run("git", ["rev-parse", `HEAD:${relative}`]).trim(), expectedBlob);
  }
});

structuralTest("native reader harness distinguishes textContent from rendered innerText", () => {
  const effects = makeEffects();
  const dom = createMiniDom(effects);
  const row = dom.document.createElement("a");
  const native = dom.document.createElement("span");
  const visual = dom.document.createElement("span");
  native.textContent = "Native clean";
  native.setAttribute("data-h2o-title-native-hidden", "1");
  visual.textContent = "✨ Canonical";
  row.append(native, visual);
  dom.document.body.appendChild(row);
  assert.equal(row.textContent, "Native clean✨ Canonical");
  assert.equal(row.innerText, "✨ Canonical");
});

structuralTest("resolved product scope is exactly the authorized paths for the requested stage", () => {
  if (requestedMode === "title-default-on") {
    const onAcceptedHead = actualScope.head === DEFAULT_ON_ACCEPTED_HEAD;
    const changed = new Set([
      ...actualScope.modifiedTracked,
      ...(onAcceptedHead ? [] : actualScope.committedHeadPaths),
    ]);
    assert(sameSet(changed, DEFAULT_ON_TRACKED), `unexpected default-on path: ${[...changed].sort()}`);
    return;
  }
  if (requestedMode === "stage1f-rollback") {
    // The candidate is the union of what the single commit already carries and
    // anything still uncommitted during an amend round.
    const onAcceptedHead = actualScope.head === STAGE1F_ACCEPTED_HEAD;
    const changed = new Set([
      ...actualScope.modifiedTracked,
      ...(onAcceptedHead ? [] : actualScope.committedHeadPaths),
    ]);
    assert(sameSet(changed, STAGE1F_TRACKED), `unexpected Stage 1F path: ${[...changed].sort()}`);
    return;
  }
  assert(stage1EBScopeResolution, "Stage 1E-b structural validation requires resolved scope evidence");
  const changed = new Set(stage1EBScopeResolution.productPaths);
  assert(sameSet(changed, STAGE1EB_COMMITTED), `unexpected Stage 1E-b path: ${[...changed].sort()}`);
});

structuralTest("protected title coordinator consumers readers and disabled module remain unchanged", () => {
  const defaultOn = requestedMode === "title-default-on";
  const stage1F = requestedMode === "stage1f-rollback" || defaultOn;
  const authorizedForStage = defaultOn ? DEFAULT_ON_TRACKED : STAGE1F_TRACKED;
  assert(
    stage1F || stage1EBScopeResolution,
    "protected-path validation requires resolved scope evidence",
  );
  // Stage 1F repairs exactly its authorized candidate, so precisely those paths
  // leave the protected set; every other protected source must still be
  // untouched, including 9C1a, every native reader and the disabled 9D1a.
  const protectedPaths = [
    B0_REL,
    B1_REL,
    C1_REL,
    F1C_REL,
    F0D_REL,
    F2A_REL,
    F3A_REL,
    F6A_REL,
    D3A_REL,
    "src-runtime-base/9A1b.🟫🖥️ Chat List Decorator 🎨🖥️.js",
    "src-runtime-base/9A1c.🟫🖥️ Chat Meta Enricher 🧾🖥️.js",
    "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js",
    "packages/title-contract/index.mjs",
    "tools/product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs",
    "tools/validation/title-interface/validate-title-contract-bridge-v1.mjs",
    STAGE1C_REL,
  ].filter((relative) => !(stage1F && authorizedForStage.has(relative)));
  const resolvedProductPaths = new Set(
    stage1F ? actualScope.modifiedTracked : stage1EBScopeResolution.productPaths,
  );
  for (const relative of protectedPaths) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `missing protected source: ${relative}`);
    assert.equal(resolvedProductPaths.has(relative), false, `protected source entered product scope: ${relative}`);
  }
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", ...protectedPaths]).trim(), "");
});

assert.equal(scopeTests.length, 36, "Stage 1E scope scenario count drifted");
assert.equal(scenarios.length, 146, "Stage 1E runtime scenario count drifted");
assert.equal(structuralAssertions.length, 10, "Stage 1E structural assertion count drifted");

console.log(JSON.stringify({
  ok: true,
  validator: "title-stage1e-convergence-v1",
  scopeMode,
  scopeScenarios: scopeTests.length,
  runtimeScenarios: scenarios.length,
  structuralAssertions: structuralAssertions.length,
  authorizedPaths: [
    ...(
      requestedMode === "stage1eb-sidebar" || requestedMode === "stage1eb-validator-fix"
        ? STAGE1EB_COMMITTED
        : requestedMode === "stage1f-rollback"
          ? STAGE1F_TRACKED
          : requestedMode === "title-default-on"
            ? DEFAULT_ON_TRACKED
            : AUTHORIZED
    ),
  ].sort(),
  scopeResolution: stage1EBScopeResolution,
}));
