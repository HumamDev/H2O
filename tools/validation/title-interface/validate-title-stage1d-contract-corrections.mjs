#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as contract from "../../../packages/title-contract/index.mjs";

const {
  BASE_PRIORITY,
  EMOJI_PRIORITY,
  EMOJI_PROVENANCE,
  SCHEMA_VERSION,
  TITLE_PROVENANCE,
  formatDisplayTitle,
  formatNativeDisplayTitle,
  mergeRecord,
  nextFieldVersion,
  normalizePersistedTitleRecordV1,
  normalizeRecord,
  normalizeTitleBootCacheV1,
  sanitizeNativeTitle,
  validateCanonicalRecord,
} = contract;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTRACT_REL = "packages/title-contract/index.mjs";
const VALIDATOR_REL = "tools/validation/title-interface/validate-title-stage1d-contract-corrections.mjs";
const OLD_STUDIO_ADR = "docs/decisions/ADR-0011-studio-reader-notes-architecture.md";
const NEW_STUDIO_ADR = "docs/decisions/ADR-0012-studio-reader-notes-architecture.md";
const FINAL_STAGE1D_PATHS = Object.freeze([
  "packages/title-contract/index.mjs",
  "tools/validation/title-interface/validate-title-contract-v1.mjs",
  VALIDATOR_REL,
  "docs/decisions/ADR-0011-title-management-contract.md",
  NEW_STUDIO_ADR,
  "docs/systems/reader-notes/architecture-contract-v1.2.md",
  "tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs",
]);
const UNCOMMITTED_MODIFIED = Object.freeze([
  "packages/title-contract/index.mjs",
  "tools/validation/title-interface/validate-title-contract-v1.mjs",
  "docs/decisions/ADR-0011-title-management-contract.md",
  OLD_STUDIO_ADR,
  "docs/systems/reader-notes/architecture-contract-v1.2.md",
  "tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs",
]);
const UNCOMMITTED_UNTRACKED = Object.freeze([NEW_STUDIO_ADR, VALIDATOR_REL]);
const EXPECTED_EXPORTS = Object.freeze([
  "BASE_PRIORITY", "EMOJI_PRIORITY", "EMOJI_PROVENANCE", "SCHEMA_VERSION", "TITLE_PROVENANCE",
  "acceptDeliveryRevision", "applyTrustedNativeConfirmation", "applyTrustedPersistedReceipt",
  "canDeleteLegacy", "compareFieldVersionCounter", "createLifecycleOwner", "createLifecycleScope",
  "createMintAuthority", "createRenameOperation", "fieldStatus", "formatDisplayTitle",
  "formatNativeDisplayTitle", "hydrateCanonicalRecord", "isRTL", "makeReceipt", "mergeEmojiField",
  "mergeRecord", "mergeTitleField", "nextFieldVersion", "normalizeField",
  "normalizePersistedTitleRecordV1", "normalizeRecord", "normalizeRoute", "normalizeTitleBootCacheV1",
  "reduceDeliveryGate", "reduceMigration", "reduceRename", "resumeMigration", "sanitizeNativeTitle",
  "summarizeDurableWrites", "validateCanonicalRecord", "validateRecord", "verifyNativeConfirmation",
  "verifyReceipt",
].sort());
const NATIVE_CHAT_ID = "691751f6-7c8c-832a-8ebf-04dc0adc6b01";
const STUDIO_CHAT_ID = "6a5f8557-06a8-83eb-af02-f86afe4aed2e";
const EXPECTED_WRITER_KEYS = Object.freeze([
  "version", "chatId", "baseTitle", "source", "priority", "confidence",
  "emoji", "emojiSource", "emojiPriority", "emojiConfidence", "updatedAt", "emojiUpdatedAt",
].sort());

const scenarioResults = [];
const scopeResults = [];

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8" });
}

function sorted(values) {
  return [...values].sort();
}

function sameSet(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function scopeFailure(message, state) {
  throw new assert.AssertionError({
    message: `${message}: ${JSON.stringify({
      modifiedTracked: sorted(state.modifiedTracked),
      staged: sorted(state.staged),
      untracked: sorted(state.untracked),
      trackedFinal: sorted(state.trackedFinal),
      missingFinal: sorted(state.missingFinal),
      oldAdrPresent: state.oldAdrPresent,
    })}`,
  });
}

export function classifyStage1DScope(state) {
  const normalized = {
    modifiedTracked: sorted(state.modifiedTracked ?? []),
    staged: sorted(state.staged ?? []),
    untracked: sorted((state.untracked ?? []).filter((item) => !item.startsWith("chrome/"))),
    trackedFinal: sorted(state.trackedFinal ?? []),
    missingFinal: sorted(state.missingFinal ?? []),
    oldAdrPresent: state.oldAdrPresent === true,
  };
  if (normalized.staged.length) scopeFailure("Stage 1D scope forbids staged paths", normalized);
  const uncommitted = sameSet(normalized.modifiedTracked, UNCOMMITTED_MODIFIED) &&
    sameSet(normalized.untracked, UNCOMMITTED_UNTRACKED) &&
    normalized.missingFinal.length === 0 &&
    normalized.oldAdrPresent === false;
  if (uncommitted) return "uncommitted";
  const committed = normalized.modifiedTracked.length === 0 &&
    normalized.untracked.length === 0 &&
    normalized.missingFinal.length === 0 &&
    sameSet(normalized.trackedFinal, FINAL_STAGE1D_PATHS) &&
    normalized.oldAdrPresent === false;
  if (committed) return "committed-clean";
  scopeFailure("Stage 1D scope mismatch", normalized);
}

function lines(value) {
  return value.trim().split("\n").filter(Boolean);
}

function currentScopeState() {
  const modifiedTracked = lines(run("git", ["diff", "--name-only", "HEAD", "--"]));
  const staged = lines(run("git", ["diff", "--cached", "--name-only", "--"]));
  const untracked = lines(run("git", ["ls-files", "--others", "--exclude-standard", "--"]));
  const trackedFinal = lines(run("git", ["ls-files", "--", ...FINAL_STAGE1D_PATHS]));
  const missingFinal = FINAL_STAGE1D_PATHS.filter((relative) => !fs.existsSync(path.join(ROOT, relative)));
  return {
    modifiedTracked,
    staged,
    untracked,
    trackedFinal,
    missingFinal,
    oldAdrPresent: fs.existsSync(path.join(ROOT, OLD_STUDIO_ADR)),
  };
}

function assertCurrentScope() {
  return classifyStage1DScope(currentScopeState());
}

function scopeTest(name, fn) {
  fn();
  scopeResults.push(name);
  process.stdout.write(`ok scope ${scopeResults.length} - ${name}\n`);
}

function baseScope(overrides = {}) {
  return {
    modifiedTracked: [...UNCOMMITTED_MODIFIED],
    staged: [],
    untracked: [...UNCOMMITTED_UNTRACKED, "chrome/protected"],
    trackedFinal: FINAL_STAGE1D_PATHS.filter((relative) => !UNCOMMITTED_UNTRACKED.includes(relative)),
    missingFinal: [],
    oldAdrPresent: false,
    ...overrides,
  };
}

function runScopeSelfTests() {
  scopeTest("exact uncommitted correction is accepted", () => {
    assert.equal(classifyStage1DScope(baseScope()), "uncommitted");
  });
  scopeTest("exact committed-clean state is accepted", () => {
    assert.equal(classifyStage1DScope(baseScope({
      modifiedTracked: [],
      untracked: ["chrome/protected"],
      trackedFinal: [...FINAL_STAGE1D_PATHS],
    })), "committed-clean");
  });
  scopeTest("partial tracked correction is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ modifiedTracked: UNCOMMITTED_MODIFIED.slice(1) })), /scope mismatch/u);
  });
  scopeTest("staged correction is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ staged: [VALIDATOR_REL] })), /forbids staged/u);
  });
  scopeTest("foreign tracked change is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ modifiedTracked: [...UNCOMMITTED_MODIFIED, "package.json"] })), /scope mismatch/u);
  });
  scopeTest("foreign untracked change is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ untracked: [...UNCOMMITTED_UNTRACKED, "foreign.txt"] })), /scope mismatch/u);
  });
  scopeTest("missing final file is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ missingFinal: [VALIDATOR_REL] })), /scope mismatch/u);
  });
  scopeTest("missing new source file is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ untracked: [NEW_STUDIO_ADR] })), /scope mismatch/u);
  });
  scopeTest("unremoved duplicate ADR is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({ oldAdrPresent: true })), /scope mismatch/u);
  });
  scopeTest("mixed committed and uncommitted state is rejected", () => {
    assert.throws(() => classifyStage1DScope(baseScope({
      modifiedTracked: [VALIDATOR_REL],
      untracked: [],
      trackedFinal: [...FINAL_STAGE1D_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("self-modified validator is not committed-clean", () => {
    assert.throws(() => classifyStage1DScope(baseScope({
      modifiedTracked: [VALIDATOR_REL],
      untracked: [],
      trackedFinal: [...FINAL_STAGE1D_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("protected chrome state is ignored without broad untracked tolerance", () => {
    assert.equal(classifyStage1DScope(baseScope({ untracked: [...UNCOMMITTED_UNTRACKED, "chrome/anything"] })), "uncommitted");
  });
  assert.equal(scopeResults.length, 12, "scope scenario count drifted");
}

function test(name, fn) {
  fn();
  scenarioResults.push(name);
  process.stdout.write(`ok ${scenarioResults.length} - ${name}\n`);
}

function deepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor && deepFrozen(descriptor.value, seen);
  });
}

function productionFormatterWithIntl(intlValue) {
  const source = fs.readFileSync(path.join(ROOT, CONTRACT_REL), "utf8");
  const exportDeclarations = [...source.matchAll(/^export (?:const|function) ([A-Za-z_$][A-Za-z0-9_$]*)/gmu)];
  assert.equal(exportDeclarations.length, EXPECTED_EXPORTS.length, "production-source export anchors drifted");
  assert.equal((source.match(/^export function formatNativeDisplayTitle/gmu) ?? []).length, 1,
    "formatNativeDisplayTitle production anchor drifted");
  assert.equal((source.match(/^export function formatDisplayTitle/gmu) ?? []).length, 1,
    "formatDisplayTitle production anchor drifted");
  assert.equal((source.match(/^import\s/gmu) ?? []).length, 0, "production contract must remain dependency-free");
  const executable = source.replace(/^export /gmu, "");
  assert.equal((executable.match(/^export /gmu) ?? []).length, 0, "production export transformation incomplete");
  const context = vm.createContext({ Intl: intlValue });
  new vm.Script(
    `${executable}\nglobalThis.__stage1dFormatter = Object.freeze({ formatNativeDisplayTitle });`,
    { filename: CONTRACT_REL },
  ).runInContext(context, { timeout: 1_000 });
  assert.equal(typeof context.__stage1dFormatter?.formatNativeDisplayTitle, "function");
  return (baseTitle, emoji) =>
    JSON.stringify(context.__stage1dFormatter.formatNativeDisplayTitle(baseTitle, emoji));
}

function assertProductionSourceDeterminism(name, emoji, valid) {
  test(`production-source determinism with and without Intl.Segmenter: ${name}`, () => {
    assert.equal(typeof Intl.Segmenter, "function", "test host must provide the present-Segmenter path");
    const withSegmenter = productionFormatterWithIntl(Intl);
    const withoutSegmenter = productionFormatterWithIntl(Object.freeze({}));
    const bases = valid ? ["Hello", `${emoji} Hello`, `Hello ${emoji}`] : ["Hello"];
    for (const baseTitle of bases) {
      const presentBytes = withSegmenter(baseTitle, emoji);
      const absentBytes = withoutSegmenter(baseTitle, emoji);
      assert.equal(absentBytes, presentBytes, `${name} output depends on Intl.Segmenter availability`);
      assert.equal(presentBytes, JSON.stringify(formatNativeDisplayTitle(baseTitle, emoji)),
        `${name} VM output differs from imported production output`);
      const parsed = JSON.parse(presentBytes);
      assert.equal(parsed.text, valid ? `${emoji} Hello` : "Hello",
        valid ? `${name} selected emoji disappeared` : `${name} invalid input altered the title`);
      assert.equal(parsed.dir, "ltr");
    }
  });
}

function nativeRecord(overrides = {}) {
  return {
    version: 1,
    chatId: NATIVE_CHAT_ID,
    baseTitle: "Native title",
    source: "native",
    priority: 95,
    confidence: 0.95,
    emoji: "✨",
    emojiSource: "native-title",
    emojiPriority: 90,
    emojiConfidence: 0.85,
    updatedAt: 1_785_000_000_000,
    emojiUpdatedAt: 1_785_000_000_001,
    ...overrides,
  };
}

function studioRecord(overrides = {}) {
  return {
    version: "1.0.0",
    chatId: STUDIO_CHAT_ID,
    baseTitle: "Studio title",
    source: "studio-title-palette",
    priority: 100,
    confidence: 1,
    emoji: "👩‍💻",
    emojiSource: "user-picker-native-rename",
    emojiPriority: 100,
    emojiConfidence: 1,
    updatedAt: 1_785_000_000_100,
    emojiUpdatedAt: 1_785_000_000_100,
    ...overrides,
  };
}

function canonicalRecord() {
  const title = {
    value: "Canonical", tombstone: false, source: TITLE_PROVENANCE.STORE,
    priority: BASE_PRIORITY[TITLE_PROVENANCE.STORE], confidence: 1,
    version: { counter: 1, actorId: "store" }, routeGeneration: 1,
    operationId: null, updatedAt: 100, nativeConfirmation: null,
  };
  const emoji = {
    value: "✨", tombstone: false, source: EMOJI_PROVENANCE.STORE,
    priority: EMOJI_PRIORITY[EMOJI_PROVENANCE.STORE], confidence: 1,
    version: { counter: 1, actorId: "store" }, routeGeneration: 1,
    operationId: null, updatedAt: 100,
  };
  const record = normalizeRecord({
    schemaVersion: SCHEMA_VERSION,
    chatId: NATIVE_CHAT_ID,
    title,
    emoji,
    writerSurface: "native",
    recordUpdatedAt: 100,
    durability: null,
    migration: null,
  });
  assert(record);
  return record;
}

function payloadKeys(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const payloadStart = source.indexOf("const payload = {", start);
  const payloadLineStart = source.lastIndexOf("\n", payloadStart) + 1;
  const indent = source.slice(payloadLineStart, payloadStart).match(/^\s*/u)?.[0] ?? "";
  const payloadTail = source.slice(payloadStart);
  const close = payloadTail.match(new RegExp(`^${indent}\\};`, "mu"));
  const payloadEnd = close ? payloadStart + close.index : -1;
  assert(payloadStart > start && payloadEnd > payloadStart, `${functionName} payload anchors must be unique`);
  return [...source.slice(payloadStart, payloadEnd).matchAll(/^\s+([A-Za-z][A-Za-z0-9]*)(?:\s*:|,)/gmu)]
    .map((match) => match[1])
    .sort();
}

function runProductionScenarios() {
  assert.deepEqual(Object.keys(contract).sort(), EXPECTED_EXPORTS, "Stage 1D export surface drifted");

  test("hyphen ChatGPT suffix is removed", () => assert.equal(sanitizeNativeTitle("Title - ChatGPT"), "Title"));
  test("en-dash ChatGPT suffix is removed", () => assert.equal(sanitizeNativeTitle("Title – ChatGPT"), "Title"));
  test("em-dash ChatGPT suffix is removed", () => assert.equal(sanitizeNativeTitle("Title — ChatGPT"), "Title"));
  test("ChatGPT suffix matching is case-insensitive", () => assert.equal(sanitizeNativeTitle("Title - chatgpt"), "Title"));
  test("internal dash-separated title content is preserved", () => assert.equal(sanitizeNativeTitle("Alpha - Beta"), "Alpha - Beta"));
  test("leading ChatGPT text is preserved", () => assert.equal(sanitizeNativeTitle("ChatGPT Guide"), "ChatGPT Guide"));
  test("embedded non-terminal ChatGPT text is preserved", () => assert.equal(sanitizeNativeTitle("How ChatGPT Works - Notes"), "How ChatGPT Works - Notes"));
  test("Unicode whitespace around a terminal suffix is normalized", () => {
    assert.equal(sanitizeNativeTitle("\u00A0Title\u2003—\u202FChatGPT\u00A0"), "Title");
  });
  test("empty and whitespace-only titles sanitize deterministically", () => {
    assert.equal(sanitizeNativeTitle(""), "");
    assert.equal(sanitizeNativeTitle("\u00A0\u2003"), "");
    assert.equal(sanitizeNativeTitle(null), "");
  });
  test("selected leading emoji is composed once", () => {
    assert.deepEqual(formatNativeDisplayTitle("✨ X", "✨"), { text: "✨ X", dir: "ltr" });
  });
  test("repeated identical leading emoji clusters collapse", () => {
    assert.equal(formatNativeDisplayTitle("✨✨ X", "✨").text, "✨ X");
  });
  test("selected trailing emoji is deduplicated", () => {
    assert.equal(formatNativeDisplayTitle("X ✨", "✨").text, "✨ X");
  });
  test("repeated matching clusters at both outer edges collapse", () => {
    assert.equal(formatNativeDisplayTitle("✨ ✨ X ✨ ✨", "✨").text, "✨ X");
  });
  test("different leading edge emoji is preserved", () => {
    assert.equal(formatNativeDisplayTitle("🔥 X", "✨").text, "✨ 🔥 X");
  });
  test("different trailing edge emoji is preserved", () => {
    assert.equal(formatNativeDisplayTitle("X 🔥", "✨").text, "✨ X 🔥");
  });
  test("embedded selected emoji is preserved", () => {
    assert.equal(formatNativeDisplayTitle("X ✨ Y", "✨").text, "✨ X ✨ Y");
  });
  test("regional-indicator flag pair is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("X 🇩🇪", "🇩🇪").text, "🇩🇪 X");
  });
  test("ZWJ profession emoji is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("👩‍💻 X", "👩‍💻").text, "👩‍💻 X");
  });
  test("keycap sequence is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("X 1️⃣", "1️⃣").text, "1️⃣ X");
  });
  test("skin-tone sequence is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("X 👍🏽", "👍🏽").text, "👍🏽 X");
  });
  test("emoji plus VS16 is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("X ❤️", "❤️").text, "❤️ X");
  });
  test("ZWJ family sequence is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("👨‍👩‍👧‍👦 X", "👨‍👩‍👧‍👦").text, "👨‍👩‍👧‍👦 X");
  });
  test("rainbow-flag sequence is one qualifying cluster", () => {
    assert.equal(formatNativeDisplayTitle("X 🏳️‍🌈", "🏳️‍🌈").text, "🏳️‍🌈 X");
  });
  test("emoji-only title remains one selected cluster", () => {
    assert.equal(formatNativeDisplayTitle("✨", "✨").text, "✨");
  });
  test("lone regional indicator is invalid selected input", () => {
    assert.deepEqual(formatNativeDisplayTitle("X", "🇩"), { text: "X", dir: "ltr" });
  });
  test("bare ZWJ does not qualify as selected emoji", () => {
    assert.deepEqual(formatNativeDisplayTitle("X", "\u200D"), { text: "X", dir: "ltr" });
  });
  test("bare VS16 does not qualify as selected emoji", () => {
    assert.deepEqual(formatNativeDisplayTitle("X", "\uFE0F"), { text: "X", dir: "ltr" });
  });
  test("plain text is invalid selected emoji input", () => {
    assert.deepEqual(formatNativeDisplayTitle("X", "emoji"), { text: "X", dir: "ltr" });
  });
  test("multiple separate emoji clusters are invalid selected input", () => {
    assert.deepEqual(formatNativeDisplayTitle("Hello", "✨✨"), { text: "Hello", dir: "ltr" });
  });
  test("mixed text and emoji is invalid selected input", () => {
    assert.deepEqual(formatNativeDisplayTitle("Hello", "mark✨"), { text: "Hello", dir: "ltr" });
  });
  test("empty emoji is omitted", () => assert.deepEqual(formatNativeDisplayTitle("X", ""), { text: "X", dir: "ltr" }));
  test("empty title composes a valid selected emoji once", () => {
    assert.deepEqual(formatNativeDisplayTitle("", "✨"), { text: "✨", dir: "ltr" });
  });
  test("5000-character title formatting is deterministic and untruncated", () => {
    const title = "A".repeat(5_000);
    const formatted = formatNativeDisplayTitle(title, "✨");
    assert.equal(formatted.text, `✨ ${title}`);
    assert.equal(formatted.text.length, 5_002);
  });
  test("Hebrew and Arabic use the accepted RTL direction", () => {
    assert.deepEqual(formatNativeDisplayTitle("שלום", "✨"), { text: "שלום ✨", dir: "rtl" });
    assert.deepEqual(formatNativeDisplayTitle("مرحبا", "✨"), { text: "مرحبا ✨", dir: "rtl" });
  });
  test("presentation forms are RTL while Latin remains LTR and mixed text is RTL", () => {
    assert.equal(formatNativeDisplayTitle("\uFB1D", "✨").dir, "rtl");
    assert.equal(formatNativeDisplayTitle("\uFE70", "✨").dir, "rtl");
    assert.equal(formatNativeDisplayTitle("Latin", "✨").dir, "ltr");
    assert.equal(formatNativeDisplayTitle("Latin שלום", "✨").dir, "rtl");
  });
  test("emoji parser has no Intl.Segmenter or Array.from output path", () => {
    const source = fs.readFileSync(path.join(ROOT, CONTRACT_REL), "utf8");
    const start = source.indexOf("function codePointToken");
    const end = source.indexOf("export function normalizeRoute", start);
    assert(start >= 0 && end > start, "deterministic emoji-parser anchors drifted");
    const formatterSection = source.slice(start, end);
    assert(!formatterSection.includes("Intl.Segmenter"));
    assert(!formatterSection.includes("Array.from"));
  });

  for (const [name, emoji] of [
    ["extended pictograph", "✨"],
    ["regional-indicator flag", "🇩🇪"],
    ["ZWJ profession", "👩‍💻"],
    ["keycap", "1️⃣"],
    ["ZWJ family", "👨‍👩‍👧‍👦"],
    ["skin tone", "👍🏽"],
    ["emoji plus VS16", "❤️"],
    ["rainbow flag", "🏳️‍🌈"],
  ]) assertProductionSourceDeterminism(name, emoji, true);
  for (const [name, emoji] of [
    ["bare ZWJ", "\u200D"],
    ["bare VS16", "\uFE0F"],
    ["combining-mark text", "e\u0301"],
    ["multiple separate clusters", "✨✨"],
  ]) assertProductionSourceDeterminism(name, emoji, false);

  test("full Native numeric-version DTO normalizes without authority conversion", () => {
    const result = normalizePersistedTitleRecordV1(nativeRecord());
    assert(result);
    assert.deepEqual(result, nativeRecord());
    assert(deepFrozen(result));
    assert.equal(validateCanonicalRecord(result), false);
  });
  test("current-reader-compatible partial Native DTO is preserved without invented fields", () => {
    const result = normalizePersistedTitleRecordV1({
      version: 1, chatId: NATIVE_CHAT_ID, baseTitle: "  Partial   Native  ", source: "native", priority: 95,
    });
    assert.deepEqual(result, {
      version: 1, chatId: NATIVE_CHAT_ID, baseTitle: "Partial Native", source: "native", priority: 95,
    });
    assert(!Object.hasOwn(result, "confidence"));
    assert(!Object.hasOwn(result, "updatedAt"));
  });
  test("full Studio string-version DTO preserves every observed field", () => {
    const result = normalizePersistedTitleRecordV1(studioRecord());
    assert.deepEqual(result, studioRecord());
    assert(deepFrozen(result));
  });
  test("both real Studio writers expose equivalent persisted field sets", () => {
    const mainSource = fs.readFileSync(path.join(ROOT, "src-surfaces-base/studio/studio.js"), "utf8");
    const moduleSource = fs.readFileSync(path.join(ROOT, "src-surfaces-base/studio/S9D1a. 🎬 Auto Emoji Title - Studio.js"), "utf8");
    assert.deepEqual(payloadKeys(mainSource, "persistChatTitleState"), EXPECTED_WRITER_KEYS);
    assert.deepEqual(payloadKeys(moduleSource, "persistTitleState"), EXPECTED_WRITER_KEYS);
  });
  test("common empty emoji value normalizes to null", () => {
    const result = normalizePersistedTitleRecordV1(nativeRecord({ emoji: "" }));
    assert.equal(result.emoji, null);
  });
  test("zero persisted timestamps are preserved where current readers tolerate them", () => {
    const result = normalizePersistedTitleRecordV1(nativeRecord({ updatedAt: 0, emojiUpdatedAt: 0 }));
    assert.equal(result.updatedAt, 0);
    assert.equal(result.emojiUpdatedAt, 0);
  });
  test("unsupported persisted versions fail closed", () => {
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ version: 2 })), null);
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ version: "1" })), null);
  });
  test("unknown persisted key fails closed", () => {
    assert.equal(normalizePersistedTitleRecordV1({ ...nativeRecord(), extra: true }), null);
  });
  test("counter injection fails closed", () => {
    assert.equal(normalizePersistedTitleRecordV1({ ...nativeRecord(), counter: 1 }), null);
  });
  test("actor-ID injection fails closed", () => {
    assert.equal(normalizePersistedTitleRecordV1({ ...nativeRecord(), actorId: "attacker" }), null);
  });
  test("canonical field-envelope injection fails closed", () => {
    assert.equal(normalizePersistedTitleRecordV1({ ...nativeRecord(), title: { value: "Injected" } }), null);
  });
  test("malformed persisted field types fail closed", () => {
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ priority: "95" })), null);
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ confidence: Number.NaN })), null);
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ emoji: {} })), null);
  });
  test("accessor-bearing DTO fails without invoking its getter", () => {
    let invoked = 0;
    const raw = nativeRecord();
    Object.defineProperty(raw, "baseTitle", { enumerable: true, get() { invoked += 1; return "secret"; } });
    assert.equal(normalizePersistedTitleRecordV1(raw), null);
    assert.equal(invoked, 0);
  });
  test("Proxy descriptor failure returns a bounded null result", () => {
    const raw = new Proxy({}, { ownKeys() { throw new Error("blocked"); } });
    assert.equal(normalizePersistedTitleRecordV1(raw), null);
  });
  test("persisted DTO requires a semantic title or emoji field", () => {
    assert.equal(normalizePersistedTitleRecordV1({ version: 1, chatId: NATIVE_CHAT_ID }), null);
  });
  test("malformed chat IDs and unsafe numeric values fail closed", () => {
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ chatId: "bad id" })), null);
    assert.equal(normalizePersistedTitleRecordV1(nativeRecord({ updatedAt: Number.MAX_SAFE_INTEGER + 1 })), null);
  });

  test("valid boot-cache envelope normalizes and freezes deeply", () => {
    const raw = {
      version: 1, chatId: NATIVE_CHAT_ID, state: nativeRecord(),
      updatedAt: 1_000, expiresAt: 2_000,
    };
    const result = normalizeTitleBootCacheV1(raw);
    assert(result);
    assert(deepFrozen(result));
    assert.notStrictEqual(result.state, raw.state);
  });
  test("boot-cache delegates a valid Native state to the DTO normalizer", () => {
    const result = normalizeTitleBootCacheV1({
      version: 1, chatId: NATIVE_CHAT_ID, state: nativeRecord({ baseTitle: "Title - ChatGPT" }),
      updatedAt: 0, expiresAt: 2_000,
    });
    assert.equal(result.state.baseTitle, "Title");
  });
  test("boot-cache delegates a valid Studio state to the DTO normalizer", () => {
    const result = normalizeTitleBootCacheV1({
      version: "1.0.0", chatId: STUDIO_CHAT_ID, state: studioRecord(),
      updatedAt: 1_000, expiresAt: 2_000,
    });
    assert.equal(result.state.version, "1.0.0");
  });
  test("missing or non-later boot-cache expiry fails closed without side effects", () => {
    const base = { version: 1, chatId: NATIVE_CHAT_ID, state: nativeRecord(), updatedAt: 1_000 };
    assert.equal(normalizeTitleBootCacheV1(base), null);
    assert.equal(normalizeTitleBootCacheV1({ ...base, expiresAt: 1_000 }), null);
  });
  test("unknown boot-cache key fails closed", () => {
    assert.equal(normalizeTitleBootCacheV1({
      version: 1, chatId: NATIVE_CHAT_ID, state: nativeRecord(), updatedAt: 1_000, expiresAt: 2_000, deleteOnExpiry: true,
    }), null);
  });
  test("malformed boot-cache state fails closed", () => {
    assert.equal(normalizeTitleBootCacheV1({
      version: 1, chatId: NATIVE_CHAT_ID, state: { nested: true }, updatedAt: 1_000, expiresAt: 2_000,
    }), null);
  });
  test("invalid envelope version and mismatched nested identity fail closed", () => {
    assert.equal(normalizeTitleBootCacheV1({
      version: 2, chatId: NATIVE_CHAT_ID, state: nativeRecord(), updatedAt: 1_000, expiresAt: 2_000,
    }), null);
    assert.equal(normalizeTitleBootCacheV1({
      version: 1, chatId: NATIVE_CHAT_ID, state: studioRecord(), updatedAt: 1_000, expiresAt: 2_000,
    }), null);
  });

  test("authority negative: counters cannot enter the DTO boundary", () => {
    assert.equal(normalizePersistedTitleRecordV1({ ...nativeRecord(), counter: 9 }), null);
  });
  test("authority negative: actor identity cannot enter the DTO boundary", () => {
    assert.equal(normalizePersistedTitleRecordV1({ ...nativeRecord(), actorId: "native-adapter" }), null);
  });
  test("authority negative: DTO normalization never invokes minting logic", () => {
    const source = fs.readFileSync(path.join(ROOT, "packages/title-contract/index.mjs"), "utf8");
    const start = source.indexOf("export function normalizePersistedTitleRecordV1");
    const end = source.indexOf("export function normalizeTitleBootCacheV1", start);
    const body = source.slice(start, end);
    assert(!/createMintAuthority|nextFieldVersion|mintAuthorities/u.test(body));
    const dto = normalizePersistedTitleRecordV1(nativeRecord({ source: "native-confirmed" }));
    assert(dto);
    assert.throws(() => nextFieldVersion([{ counter: 0, actorId: "legacy" }], dto), /mint capability/u);
  });
  test("authority negative: DTO cannot act as canonical state or merge input", () => {
    const dto = normalizePersistedTitleRecordV1(nativeRecord({ source: "native-observed" }));
    const current = canonicalRecord();
    assert.equal(validateCanonicalRecord(dto), false);
    assert.strictEqual(mergeRecord(current, dto), current);
    assert.throws(() => mergeRecord(dto, current), /not canonical/u);
  });
  test("new DTO and display results are fresh deeply frozen values", () => {
    const raw = nativeRecord();
    const first = normalizePersistedTitleRecordV1(raw);
    const second = normalizePersistedTitleRecordV1(raw);
    assert.notStrictEqual(first, raw);
    assert.notStrictEqual(first, second);
    assert(deepFrozen(first));
    assert(Object.isFrozen(formatNativeDisplayTitle("X", "✨")));
  });
  test("existing canonical and display APIs retain their Stage 1A behavior", () => {
    assert.deepEqual(formatDisplayTitle("Alpha - ChatGPT", "✨"), { text: "✨ Alpha - ChatGPT", dir: "ltr" });
    assert.equal(normalizeRecord(nativeRecord()), null);
    assert.equal(validateCanonicalRecord(canonicalRecord()), true);
  });

  assert.equal(scenarioResults.length, 77, "Stage 1D production scenario count drifted");
}

function assertArchitectureDocs() {
  const titleAdr = fs.readFileSync(path.join(ROOT, "docs/decisions/ADR-0011-title-management-contract.md"), "utf8");
  const studioAdr = fs.readFileSync(path.join(ROOT, NEW_STUDIO_ADR), "utf8");
  const readerContract = fs.readFileSync(path.join(ROOT, "docs/systems/reader-notes/architecture-contract-v1.2.md"), "utf8");
  const readerValidator = fs.readFileSync(path.join(ROOT, "tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs"), "utf8");
  for (const term of [
    "Surface-neutral persisted DTO boundary", "normalizePersistedTitleRecordV1", "normalizeTitleBootCacheV1",
    "Current persisted records", "sanitizeNativeTitle", "formatNativeDisplayTitle",
    "Bridge identity and regeneration", "does not regenerate",
  ]) assert(titleAdr.includes(term), `title ADR missing ${term}`);
  assert(studioAdr.includes("# ADR-0012: Studio Reader & Notes Architecture Contract"));
  assert(studioAdr.includes("originally published with the duplicate"));
  assert(readerContract.includes("ADR-0012-studio-reader-notes-architecture.md"));
  assert(readerValidator.includes("ADR-0012-studio-reader-notes-architecture.md"));
  assert(!readerContract.includes("ADR-0011-studio-reader-notes-architecture.md"));
  assert(!readerValidator.includes("ADR-0011-studio-reader-notes-architecture.md"));
}

function printScope() {
  process.stdout.write(`${JSON.stringify({
    finalPaths: FINAL_STAGE1D_PATHS,
    removedPath: OLD_STUDIO_ADR,
    uncommittedModified: UNCOMMITTED_MODIFIED,
    uncommittedUntracked: UNCOMMITTED_UNTRACKED,
    protectedUntrackedPrefix: "chrome/",
  }, null, 2)}\n`);
}

const args = process.argv.slice(2);
const allowedArgs = new Set(["--scope-check", "--print-scope", "--self-test-scope"]);
if (args.length > 1 || args.some((arg) => !allowedArgs.has(arg))) {
  throw new Error(`unknown or duplicate Stage 1D validator option: ${args.join(" ")}`);
}

if (args[0] === "--print-scope") {
  printScope();
} else if (args[0] === "--self-test-scope") {
  runScopeSelfTests();
  console.log(`PASS Stage 1D scope self-tests: ${scopeResults.length}/${scopeResults.length}`);
} else if (args[0] === "--scope-check") {
  const scopeMode = assertCurrentScope();
  console.log(JSON.stringify({ ok: true, validator: "title-stage1d-contract-corrections", scopeMode }));
} else {
  const scopeMode = assertCurrentScope();
  runScopeSelfTests();
  runProductionScenarios();
  assertArchitectureDocs();
  console.log(JSON.stringify({
    ok: true,
    validator: "title-stage1d-contract-corrections",
    scopeMode,
    scenarios: scenarioResults.length,
    scopeScenarios: scopeResults.length,
    exports: EXPECTED_EXPORTS.length,
    addedExports: [
      "sanitizeNativeTitle", "formatNativeDisplayTitle",
      "normalizePersistedTitleRecordV1", "normalizeTitleBootCacheV1",
    ],
    studioAdr: NEW_STUDIO_ADR,
  }));
}
