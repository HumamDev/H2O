#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as contract from "../../../packages/title-contract/index.mjs";

const {
  SCHEMA_VERSION,
  TITLE_PROVENANCE,
  EMOJI_PROVENANCE,
  BASE_PRIORITY,
  EMOJI_PRIORITY,
  normalizeRecord,
  normalizeField,
  validateRecord,
  validateCanonicalRecord,
  hydrateCanonicalRecord,
  fieldStatus,
  compareFieldVersionCounter,
  mergeTitleField,
  mergeEmojiField,
  mergeRecord,
  createMintAuthority,
  nextFieldVersion,
  createRenameOperation,
  reduceRename,
  verifyNativeConfirmation,
  applyTrustedNativeConfirmation,
  isRTL,
  formatDisplayTitle,
  normalizeRoute,
  acceptDeliveryRevision,
  reduceDeliveryGate,
  summarizeDurableWrites,
  makeReceipt,
  verifyReceipt,
  applyTrustedPersistedReceipt,
  reduceMigration,
  canDeleteLegacy,
  resumeMigration,
  createLifecycleScope,
  createLifecycleOwner,
} = contract;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ALLOWLIST = new Set([
  "packages/title-contract/index.mjs",
  "tools/validation/title-interface/validate-title-contract-v1.mjs",
  "docs/decisions/ADR-0011-title-management-contract.md",
]);
const EXPECTED_EXPORTS = [
  "SCHEMA_VERSION", "TITLE_PROVENANCE", "EMOJI_PROVENANCE", "BASE_PRIORITY", "EMOJI_PRIORITY",
  "normalizeRecord", "normalizeField", "validateRecord", "validateCanonicalRecord", "hydrateCanonicalRecord", "fieldStatus",
  "compareFieldVersionCounter", "mergeTitleField", "mergeEmojiField", "mergeRecord",
  "createMintAuthority", "nextFieldVersion", "createRenameOperation", "reduceRename",
  "verifyNativeConfirmation", "applyTrustedNativeConfirmation", "isRTL", "formatDisplayTitle", "normalizeRoute",
  "acceptDeliveryRevision", "reduceDeliveryGate", "summarizeDurableWrites", "makeReceipt", "verifyReceipt",
  "applyTrustedPersistedReceipt", "reduceMigration", "canDeleteLegacy", "resumeMigration",
  "createLifecycleScope", "createLifecycleOwner",
].sort();
const TITLE_PREFIXES = ["9B0a", "9B1a", "9C1a", "9D1a"];
const results = [];

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8" });
}

function test(name, fn) {
  fn();
  results.push(name);
  process.stdout.write(`ok ${results.length} - ${name}\n`);
}

function titleField(value, options = {}) {
  const source = options.source ?? TITLE_PROVENANCE.STORE;
  return {
    value,
    tombstone: options.tombstone ?? false,
    source,
    priority: BASE_PRIORITY[source],
    confidence: options.confidence ?? 1,
    version: { counter: options.counter ?? 1, actorId: options.actorId ?? "store" },
    routeGeneration: options.routeGeneration ?? 1,
    operationId: options.operationId ?? null,
    updatedAt: options.updatedAt ?? 100,
    nativeConfirmation: options.nativeConfirmation ?? null,
  };
}

function emojiField(value, options = {}) {
  const source = options.source ?? EMOJI_PROVENANCE.STORE;
  return {
    value,
    tombstone: options.tombstone ?? false,
    source,
    priority: EMOJI_PRIORITY[source],
    confidence: options.confidence ?? 1,
    version: { counter: options.counter ?? 1, actorId: options.actorId ?? "store" },
    routeGeneration: options.routeGeneration ?? 1,
    operationId: options.operationId ?? null,
    updatedAt: options.updatedAt ?? 100,
  };
}

function rawRecord(options = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    chatId: options.chatId ?? "chat-1",
    title: options.title ?? titleField("Current"),
    emoji: options.emoji ?? emojiField("💧"),
    writerSurface: options.writerSurface ?? "native",
    recordUpdatedAt: options.recordUpdatedAt ?? 100,
    durability: options.durability ?? null,
    migration: options.migration ?? null,
  };
}

function canonical(options = {}) {
  const result = normalizeRecord(rawRecord(options));
  assert(result, "fixture must normalize");
  assert(validateCanonicalRecord(result), "fixture must be canonical");
  return result;
}

function trustedEvidence(options = {}) {
  return summarizeDurableWrites([
    { backend: options.backend ?? "indexeddb", status: "fulfilled", durable: true, value: { ok: true, durable: true } },
  ], {
    requiredBackends: [options.backend ?? "indexeddb"],
    candidateHash: options.candidateHash ?? "hash-1",
    chatId: options.chatId ?? "chat-1",
    migrationKind: options.migrationKind ?? "legacy-title",
    verifiedAt: options.verifiedAt ?? 1_000,
    adapterReceiptIds: options.adapterReceiptIds ?? ["adapter-receipt-1"],
  });
}

function confirmation(options = {}) {
  return {
    operationId: options.operationId ?? "op-1",
    confirmedValue: options.confirmedValue ?? "Confirmed",
    confirmedAt: options.confirmedAt ?? 1_000,
    adapterReceiptId: options.adapterReceiptId ?? "adapter-receipt-1",
    routeGeneration: options.routeGeneration ?? 3,
  };
}

function confirmationContext(options = {}) {
  return {
    chatId: options.chatId ?? "chat-1",
    expectedChatId: options.chatId ?? "chat-1",
    latestPendingOperationId: options.operationId ?? "op-1",
    expectedRouteGeneration: options.routeGeneration ?? 3,
    trustedAdapterReceiptIds: options.trustedAdapterReceiptIds ?? ["adapter-receipt-1"],
    supersededOperationIds: options.supersededOperationIds ?? [],
    now: options.now ?? 1_000,
    maxAgeMs: options.maxAgeMs ?? 5_000,
  };
}

function operation(id, title = `Title ${id}`, routeGeneration = 1) {
  return createRenameOperation({
    chatId: "chat-1",
    operationId: id,
    requestedTitle: title,
    expectedPreviousTitle: "Current",
    routeGeneration,
    startedAt: 100,
    provenance: TITLE_PROVENANCE.EXPLICIT_USER,
  });
}

function migrationThroughReceipt() {
  let state = reduceMigration(null, { type: "candidate-normalized", chatId: "chat-1", migrationKind: "legacy-title", candidateHash: "hash-1" });
  state = reduceMigration(state, { type: "write-pending" });
  state = reduceMigration(state, { type: "written", durable: true });
  state = reduceMigration(state, { type: "readback-verified", matches: true });
  const receipt = makeReceipt({ migrationKind: "legacy-title", chatId: "chat-1", candidateHash: "hash-1", durable: true, backend: "indexeddb", verifiedAt: 1_000 });
  state = reduceMigration(state, { type: "receipt-persisted", receipt });
  return { state, receipt };
}

function assertScope() {
  assert.deepEqual(Object.keys(contract).sort(), EXPECTED_EXPORTS, "public exports drifted");
  const modified = run("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--"]).trim().split("\n").filter(Boolean);
  for (const relative of modified) assert(ALLOWLIST.has(relative), `unexpected tracked change: ${relative}`);
  assert.equal(run("git", ["diff", "--cached", "--name-only", "--"]).trim(), "", "staged files are forbidden");
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard", "--"]).trim().split("\n").filter(Boolean);
  for (const relative of untracked) assert(relative.startsWith("chrome/") || ALLOWLIST.has(relative), `unexpected untracked path: ${relative}`);
  assert(!Object.hasOwn(contract, "compareFieldVersion"), "obsolete compareFieldVersion export is forbidden");
  const source = fs.readFileSync(path.join(ROOT, "packages/title-contract/index.mjs"), "utf8");
  for (const forbidden of ["node:", "document", "window", "fetch(", "localStorage", "sessionStorage", "setTimeout(", "setInterval(", "__normalized", "__canonical"]){
    assert(!source.includes(forbidden), `production module contains forbidden token: ${forbidden}`);
  }
}

function assertRuntimeUntouched() {
  const names = fs.readdirSync(path.join(ROOT, "src-runtime-base"));
  for (const prefix of TITLE_PREFIXES) {
    const matches = names.filter((name) => name.startsWith(prefix));
    assert.equal(matches.length, 1, `${prefix} path count`);
    const relative = path.join("src-runtime-base", matches[0]);
    const worktree = run("git", ["hash-object", "--no-filters", "--", relative]).trim();
    const head = run("git", ["rev-parse", `HEAD:${relative}`]).trim();
    assert.equal(worktree, head, `${relative} differs from HEAD`);
  }
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "config/dev-order.tsv"]).trim(), "", "dev-order.tsv changed");
}

test("file scope, export surface, and browser-safe production module", () => {
  assertScope();
  assertRuntimeUntouched();
});

test("1 stale equal-priority Store payload rejected", () => {
  const current = canonical({ title: titleField("New", { counter: 4, updatedAt: 400 }) });
  const incoming = rawRecord({ title: titleField("Old", { counter: 3, updatedAt: 300 }) });
  assert.strictEqual(mergeRecord(current, incoming), current);
});

test("2 newer trusted Native confirmation accepted", () => {
  const current = canonical({ title: titleField("Before", { counter: 2 }) });
  const authority = createMintAuthority("native-1", "native-adapter");
  const next = applyTrustedNativeConfirmation(current, confirmation(), confirmationContext(), authority);
  assert.equal(next.title.value, "Confirmed");
  assert.equal(next.title.version.counter, 3);
  assert(next.title.nativeConfirmation);
});

test("3 stale PATCH response rejected", () => {
  let state = reduceRename(null, { type: "start", operation: operation("op-new") });
  state = reduceRename(state, { type: "dispatched", operationId: "op-new" });
  const unchanged = reduceRename(state, { type: "response", operationId: "op-old", ok: true });
  assert.strictEqual(unchanged, state);
});

test("4 two rapid renames resolve to latest intent", () => {
  let state = reduceRename(null, { type: "start", operation: operation("op-1") });
  state = reduceRename(state, { type: "start", operation: operation("op-2") });
  assert.equal(state.active.operationId, "op-2");
  assert.deepEqual(state.supersededOperationIds, ["op-1"]);
  assert.strictEqual(reduceRename(state, { type: "confirmed", operationId: "op-1", confirmation: confirmation({ operationId: "op-1" }) }), state);
  assert.equal(reduceRename(state, { type: "confirmed", operationId: "op-2", confirmation: confirmation({ operationId: "op-2" }) }).state, "confirmed");
});

test("5 route change during pending rename reconciles", () => {
  let state = reduceRename(null, { type: "start", operation: operation("op-1", "Rename", 7) });
  state = reduceRename(state, { type: "dispatched", operationId: "op-1" });
  state = reduceRename(state, { type: "route-change", routeGeneration: 8 });
  assert.equal(state.state, "reconcile");
});

test("6 duplicate delivery produces one accepted revision", () => {
  let state = reduceDeliveryGate(null, { revision: 5, alias: "bare" });
  state = reduceDeliveryGate(state, { revision: 5, alias: "evt:title" });
  assert.deepEqual(state, { lastAcceptedRevision: 5, acceptedCount: 1 });
  assert.equal(acceptDeliveryRevision(5, { revision: 4 }).accepted, false);
});

test("7 migration write without readback never permits deletion", () => {
  let state = reduceMigration(null, { type: "candidate-normalized", chatId: "chat-1", migrationKind: "legacy-title", candidateHash: "hash-1" });
  state = reduceMigration(state, { type: "write-pending" });
  state = reduceMigration(state, { type: "written", durable: true });
  assert.equal(canDeleteLegacy(state), false);
});

test("8 verified trusted receipt permits one idempotent deletion", () => {
  const { state, receipt } = migrationThroughReceipt();
  const eligible = applyTrustedPersistedReceipt(state, receipt, trustedEvidence());
  assert.equal(canDeleteLegacy(eligible), true);
  const deleted = reduceMigration(eligible, { type: "delete" });
  assert.equal(deleted.state, "deleted");
  assert.strictEqual(reduceMigration(deleted, { type: "delete" }), deleted);
});

test("9 crash after receipt persistence resumes safely", () => {
  const { state, receipt } = migrationThroughReceipt();
  const expected = { chatId: "chat-1", migrationKind: "legacy-title", candidateHash: "hash-1", acceptableBackends: ["indexeddb"], now: 1_000 };
  const resumed = resumeMigration(state, receipt, trustedEvidence(), expected);
  assert.equal(resumed.state, "delete-eligible");
});

test("10 Studio total write failure reports failure", () => {
  const summary = summarizeDurableWrites([
    { backend: "indexeddb", status: "rejected", reason: "offline" },
    { backend: "filesystem", status: "rejected", reason: "denied" },
  ], { requiredBackends: ["indexeddb"] });
  assert.equal(summary.ok, false);
  assert.equal(summary.durable, false);
  assert.equal(summary.errorKind, "all-attempts-failed");
});

test("11 duplicate install leaves one lifecycle owner", () => {
  const owner = createLifecycleOwner();
  let installs = 0;
  const identity = {};
  const first = owner.install(identity, (scope) => { installs += 1; scope.register(() => {}); });
  const second = owner.install(identity, () => { installs += 1; });
  assert.strictEqual(first, second);
  assert.equal(installs, 1);
  owner.destroy();
});

test("12 destroy removes fake observers listeners timers and subscriptions", () => {
  const scope = createLifecycleScope();
  const active = new Set(["observer", "listener", "timer", "subscription"]);
  for (const item of active) scope.register(() => active.delete(item));
  scope.destroy();
  assert.equal(active.size, 0);
  assert.equal(scope.destroyed, true);
});

test("13 malformed and accessor-bearing records fail closed", () => {
  let getterCalls = 0;
  const raw = rawRecord();
  Object.defineProperty(raw, "title", { enumerable: true, get() { getterCalls += 1; return titleField("Bad"); } });
  assert.equal(normalizeRecord(raw), null);
  assert.equal(validateRecord(raw), false);
  assert.equal(getterCalls, 0);
});

test("14 emoji clear propagates as a tombstone", () => {
  const current = canonical({ emoji: emojiField("🙂", { counter: 2 }) });
  const incoming = rawRecord({ emoji: emojiField(null, { tombstone: true, counter: 3, actorId: "user" }) });
  const merged = mergeRecord(current, incoming);
  assert.equal(fieldStatus(merged.emoji), "tombstone");
});

test("15 RTL formatting is identical for Native and Studio", () => {
  assert.equal(isRTL("שלום"), true);
  const native = formatDisplayTitle("שלום", "💧");
  const studio = formatDisplayTitle("שלום", "💧");
  assert.deepEqual(native, studio);
  assert.deepEqual(native, { text: "שלום 💧", dir: "rtl" });
  assert.deepEqual(formatDisplayTitle("Hello", "💧"), { text: "💧 Hello", dir: "ltr" });
});

test("16 legacy numeric and Studio string versions normalize conservatively", () => {
  for (const version of [1, "1.0.0"]) {
    const record = normalizeRecord({ version, chatId: "legacy-chat", title: "Legacy", emoji: "", writerSurface: "legacy", recordUpdatedAt: 0 });
    assert(record);
    assert.deepEqual(record.title.version, { counter: 0, actorId: "legacy" });
    assert.deepEqual(record.emoji.version, { counter: 0, actorId: "legacy" });
    assert.equal(record.title.nativeConfirmation, null);
  }
});

test("17 same-route external Native observation can mint past priority 100", () => {
  const current = canonical({ title: titleField("Old confirmed", { source: TITLE_PROVENANCE.NATIVE_CONFIRMED, counter: 5, actorId: "native-old" }) });
  const authority = createMintAuthority("native-new", "native-adapter");
  const next = applyTrustedNativeConfirmation(current, confirmation({ operationId: "external", confirmedValue: "External", routeGeneration: 9 }), confirmationContext({ operationId: "external", routeGeneration: 9 }), authority);
  assert.equal(next.title.version.counter, 6);
  assert.equal(next.title.value, "External");
});

test("18 trusted current Native confirmation survives mergeRecord", () => {
  const authority = createMintAuthority("native", "native-adapter");
  const current = applyTrustedNativeConfirmation(canonical(), confirmation(), confirmationContext(), authority);
  const stale = rawRecord({ title: titleField("Optimistic", { counter: current.title.version.counter - 1 }) });
  const merged = mergeRecord(current, stale);
  assert.strictEqual(merged, current);
  assert.equal(merged.title.nativeConfirmation.adapterReceiptId, "adapter-receipt-1");
});

test("19 untrusted incoming confirmation is stripped", () => {
  const incoming = rawRecord({ title: titleField("Claim", { source: TITLE_PROVENANCE.NATIVE_CONFIRMED, counter: 9, nativeConfirmation: confirmation() }) });
  const normalized = normalizeRecord(incoming);
  assert(normalized);
  assert.equal(normalized.title.nativeConfirmation, null);
  assert.equal(normalized.title.source, TITLE_PROVENANCE.UNKNOWN);
  assert.equal(normalized.title.priority, BASE_PRIORITY[TITLE_PROVENANCE.UNKNOWN]);
});

test("20 actor ID is the final tie-break only", () => {
  const current = canonical({ title: titleField("A", { counter: 5, actorId: "actor-a", updatedAt: 500 }) });
  const actorWins = rawRecord({ title: titleField("B", { counter: 5, actorId: "actor-b", updatedAt: 500 }) });
  assert.equal(mergeRecord(current, actorWins).title.value, "B");
  const priorityWins = rawRecord({ title: titleField("User", { source: TITLE_PROVENANCE.EXPLICIT_USER, counter: 5, actorId: "actor-0", updatedAt: 500 }) });
  assert.equal(mergeRecord(current, priorityWins).title.value, "User");
  assert.equal(compareFieldVersionCounter({ counter: 1 }, { counter: 2 }), -1);
});

test("21 higher-version unknown cannot erase known title", () => {
  const current = canonical({ title: titleField("Known", { counter: 1 }) });
  const unknown = rawRecord({ title: titleField(null, { source: TITLE_PROVENANCE.UNKNOWN, counter: 99 }) });
  assert.strictEqual(mergeRecord(current, unknown), current);
});

test("22 higher-version unknown cannot erase or resurrect emoji state", () => {
  const present = canonical({ emoji: emojiField("🙂", { counter: 1 }) });
  const unknown = rawRecord({ emoji: emojiField(null, { source: EMOJI_PROVENANCE.UNKNOWN, counter: 99 }) });
  assert.strictEqual(mergeRecord(present, unknown), present);
  const tombstone = canonical({ emoji: emojiField(null, { tombstone: true, counter: 5 }) });
  assert.strictEqual(mergeRecord(tombstone, unknown), tombstone);
});

test("23 hydration and import do not mint counters", () => {
  const raw = rawRecord({ title: titleField("Stored", { counter: 7 }) });
  assert.equal(normalizeRecord(raw).title.version.counter, 7);
  assert.equal(hydrateCanonicalRecord(raw, {}, {}).title.version.counter, 7);
});

test("24 trusted same-route external observation mints next counter", () => {
  const capability = createMintAuthority("coordinator", "coordinator");
  assert.deepEqual(nextFieldVersion([{ counter: 2, actorId: "a" }, { counter: 8, actorId: "b" }], capability), { counter: 9, actorId: "coordinator" });
});

test("25 duplicate lifecycle installation leaves one active owner", () => {
  const owner = createLifecycleOwner();
  let active = 0;
  const key = "title";
  owner.install(key, (scope) => { active += 1; scope.register(() => { active -= 1; }); });
  owner.install(key, () => { active += 10; });
  assert.equal(active, 1);
  owner.destroy();
  assert.equal(active, 0);
});

test("26 structurally valid untrusted imported receipt cannot authorize deletion", () => {
  const { state, receipt } = migrationThroughReceipt();
  const forged = { ok: true, durable: true, requiredBackendSatisfied: true, succeededBackends: ["indexeddb"], chatId: "chat-1", migrationKind: "legacy-title", candidateHash: "hash-1" };
  assert.strictEqual(applyTrustedPersistedReceipt(state, receipt, forged), state);
  assert.equal(canDeleteLegacy(state), false);
});

test("27 no-op merge preserves exact current reference", () => {
  const current = canonical();
  assert.strictEqual(mergeRecord(current, rawRecord()), current);
});

test("changed merge is new, deeply frozen, branded, and fields are independent", () => {
  const current = canonical({ title: titleField("Title", { counter: 1 }), emoji: emojiField("🙂", { counter: 8 }) });
  const incoming = rawRecord({ title: titleField("New title", { counter: 2 }), emoji: emojiField("old", { counter: 1 }) });
  const changed = mergeRecord(current, incoming);
  assert.notStrictEqual(changed, current);
  assert(validateCanonicalRecord(changed));
  assert(Object.isFrozen(changed) && Object.isFrozen(changed.title) && Object.isFrozen(changed.title.version));
  assert.equal(changed.title.value, "New title");
  assert.strictEqual(changed.emoji, current.emoji);
  const emojiUpdate = mergeRecord(changed, rawRecord({ title: titleField("stale", { counter: 1 }), emoji: emojiField("🚰", { counter: 9 }) }));
  assert.strictEqual(emojiUpdate.title, changed.title);
  assert.equal(emojiUpdate.emoji.value, "🚰");
});

test("mint capability and canonical brand cannot be forged", () => {
  const real = createMintAuthority("actor", "user-intent");
  assert.throws(() => nextFieldVersion([{ counter: 1 }], { ...real }), /mint capability/);
  const branded = canonical();
  const clone = deepCloneAndFreeze(branded);
  assert.equal(validateCanonicalRecord(clone), false);
});

test("Proxy descriptor failures and inherited authority fail closed without getters", () => {
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("blocked"); }, ownKeys() { return ["schemaVersion"]; } });
  assert.equal(normalizeRecord(proxy), null);
  const inherited = Object.create({ schemaVersion: 2 });
  inherited.chatId = "chat";
  inherited.title = titleField("Title");
  inherited.emoji = emojiField(null);
  assert.equal(normalizeRecord(inherited), null);
});

test("counter overflow and title tombstones fail closed", () => {
  const capability = createMintAuthority("actor", "coordinator");
  assert.throws(() => nextFieldVersion([{ counter: Number.MAX_SAFE_INTEGER }], capability), /overflow/);
  assert.equal(normalizeField(titleField(null, { tombstone: true })), null);
});

test("newer explicit emoji supersedes an older tombstone", () => {
  const current = canonical({ emoji: emojiField(null, { tombstone: true, counter: 3 }) });
  const incoming = rawRecord({ emoji: emojiField("✨", { counter: 4, actorId: "user" }) });
  assert.equal(mergeRecord(current, incoming).emoji.value, "✨");
});

test("memory-only durability never permits deletion", () => {
  const summary = summarizeDurableWrites([{ backend: "memory", status: "fulfilled", durable: false, value: { ok: true } }], {
    requiredBackends: ["indexeddb"], chatId: "chat-1", migrationKind: "legacy-title", candidateHash: "hash-1", verifiedAt: 1_000,
  });
  assert.equal(summary.ok, false);
  assert.equal(summary.durable, false);
  const { state, receipt } = migrationThroughReceipt();
  assert.strictEqual(applyTrustedPersistedReceipt(state, receipt, summary), state);
});

test("cleanup is reverse-order and continues after a throw", () => {
  const scope = createLifecycleScope();
  const order = [];
  scope.register(() => order.push("first"));
  scope.register(() => { order.push("second"); throw new Error("cleanup"); });
  scope.register(() => order.push("third"));
  const errors = scope.destroy();
  assert.deepEqual(order, ["third", "second", "first"]);
  assert.equal(errors.length, 1);
  let immediate = 0;
  scope.register(() => { immediate += 1; });
  assert.equal(immediate, 1);
});

test("trusted restart hydration preserves only verified Native confirmation", () => {
  const raw = rawRecord({ title: titleField("Confirmed", { source: TITLE_PROVENANCE.NATIVE_CONFIRMED, counter: 4, operationId: "op-1", routeGeneration: 3, updatedAt: 1_000, nativeConfirmation: confirmation() }) });
  const evidence = trustedEvidence();
  const hydrated = hydrateCanonicalRecord(raw, evidence, { ...confirmationContext(), expectedChatId: "chat-1" });
  assert(hydrated.title.nativeConfirmation);
  assert.equal(hydrated.title.source, TITLE_PROVENANCE.NATIVE_CONFIRMED);
  assert.equal(hydrated.title.priority, BASE_PRIORITY[TITLE_PROVENANCE.NATIVE_CONFIRMED]);
  const untrusted = hydrateCanonicalRecord(raw, { ...evidence }, { ...confirmationContext(), expectedChatId: "chat-1" });
  assert.equal(untrusted.title.nativeConfirmation, null);
});

test("route generation is distinct from field ordering", () => {
  const a = normalizeRoute("/c/chat-a", null);
  const same = normalizeRoute("/c/chat-a", a);
  const project = normalizeRoute("/g/project-1/c/chat-b", same);
  assert.equal(a.pathnameShape, "/c/#id");
  assert.equal(same.generation, a.generation);
  assert.equal(project.generation, a.generation + 1);
  assert.equal(project.pathnameShape, "/g/#project/c/#id");
});

function deepCloneAndFreeze(value) {
  const clone = JSON.parse(JSON.stringify(value));
  const freeze = (item) => {
    if (item && typeof item === "object") { for (const nested of Object.values(item)) freeze(nested); Object.freeze(item); }
    return item;
  };
  return freeze(clone);
}

assert.equal(results.length, 37, "scenario count drifted");
console.log(`PASS title contract v1: ${results.length} executable scenarios; ${EXPECTED_EXPORTS.length} named exports`);
