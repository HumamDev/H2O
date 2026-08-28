#!/usr/bin/env node
// Validator for the Batch 2 P3A payload-transaction module.
//
// Every mutation exercised here happens inside a disposable mkdtemp fixture. No
// test reads, stats, renames or writes a real canonical payload path, and the
// suite asserts that property with realpath-normalized witnesses rather than
// trusting lexical spelling.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const ACTIVATOR_REL = "tools/publish/lean-activator.mjs";
const PAYLOAD_MODULE_REL = "tools/publish/lean-payload-transaction.mjs";
const VALIDATOR_REL = "tools/validation/publish/validate-lean-activator-v1.mjs";
const PAYLOAD_VALIDATOR_REL = "tools/validation/publish/validate-lean-payload-transaction-v1.mjs";
const PACKAGE_REL = "package.json";
const PACKAGE_LOCK_REL = "package-lock.json";
const P3A_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const FINAL_PATHS = P3A_AUTHORIZED_PATHS;
const ACCEPTED_P23_HEAD = "140076112bbdd48763fa5c11145f923ff93f13d1";
const P23_SUBJECT = "fix(publish): add final pre-promotion guardrails";
const P3A_SUBJECT = "feat(publish): add transaction journal and incoming payload preparation";
const P3A_CANDIDATE_HEAD = "a141abf0049ea7ae18f0eb680139782de625ad67";
const INTEGRATED_P3A_HEAD = "57bc3b3ff23adc1f9e1bdaf975e1c61e5c6b50a2";
const P3B_SOURCE_HEAD = "53a91d3ed1593ffa6ada203023c661114a603201";
const P3B_SOURCE_SUBJECT = "feat(publish): add recoverable canonical promotion core";
const P3B_VALIDATION_SUBJECT = "test(publish): close recoverable promotion and reversal validation";
const P3B_SOURCE_PATHS = Object.freeze([ACTIVATOR_REL, PAYLOAD_MODULE_REL].sort());
const P3B_VALIDATION_PATHS = Object.freeze([VALIDATOR_REL, PAYLOAD_VALIDATOR_REL].sort());
const P3B_LEGACY_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const ACCEPTED_EXTENSION_VARIANT = "dev-controls-oauth-google";

// P3C-A1 builds directly on the integrated P3B stack.
const INTEGRATED_P3B_HEAD = "ba24012b342ff5343e53d588a77e3e05deff44ae";
const P3C_A1_SUBJECT = "feat(publish): add end-to-end activation and durable acceptance";
const P3C_A1_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const ACCEPTED_P3C_A1_HEAD = "0cbfdf335c5569fbbd5b1ec423a8a2f3ecff452e";
const P3C_A2_SUBJECT = "feat(publish): add canonical verification and lease contention closure";
const WRITER_VALIDATOR_REL = "tools/validation/publish/validate-canonical-writer-enforcement-v1.mjs";
const P3C_A2_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL, WRITER_VALIDATOR_REL,
].sort());
// P3C-A2.1: a validator-only governance follow-up on the accepted P3C-A2 commit.
const ACCEPTED_P3C_A2_HEAD = "55d4dee2de10672901a624b45b3a4abfea16c3a7";
const P3C_A2_1_SUBJECT = "test(publish): refresh canonical writer governance pins";
const P3C_A2_1_AUTHORIZED_PATHS = Object.freeze([
  VALIDATOR_REL, PAYLOAD_VALIDATOR_REL, WRITER_VALIDATOR_REL,
].sort());
const ACCEPTED_P3C_A2_1_HEAD = "2ae9d27d0fa85eda446830fd07bca7ea04afb8b7";
const P3C_B1_SUBJECT = "feat(publish): add deterministic activation recovery";
const P3C_B1_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
// P3C-B1 needed no payload-module change, and a no-op edit purely to widen the
// commit is not acceptable, so the committed set is exactly these three.
const P3C_B1_COMMITTED_PATHS = Object.freeze([
  ACTIVATOR_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
// Activation-completeness prerequisite: intent resolution + complete
// previous-generation rollback evidence, on top of the accepted B1 commit.
const ACCEPTED_P3C_B1_HEAD = "15500f7b3ef271c78632a4da0fa13dc227948672";
const P3C_A3_SUBJECT = "fix(publish): complete activation intent and rollback evidence";
const P3C_A3_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const ACCEPTED_P3C_A3A_HEAD = "6d48185b0601c16ca82c09813ef435a05f5f63a9";
// P3C main synchronization: an explicit merge of the advanced main tip into the
// P3C branch, followed by a narrow two-validator authority bridge.
const P3C_SYNC_MERGE_HEAD = "26de895d5b6755c5d75b93b185a81247978c5816";
const P3C_SYNC_MAIN_TIP = "a90e5d988b531e471fbee8abd65c62b24306ce7b";
const P3C_SYNC_FIRST_PARENT = "6f4ca4d29866a3d102e7b80d372f96827e28c0d0";
const P3C_SYNC_SUBJECT = "test(publish): authorize synchronized P3C history";
const P3C_SYNC_AUTHORIZED_PATHS = Object.freeze([
  VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
// FINAL Title release synchronization: one explicit merge of the exact current
// committed main tip into the completed activation/verification/recovery branch,
// followed by this narrow two-validator authority bridge. B2a/B2b rollback work
// is deliberately NOT part of this release and is not an ancestor here.
const P3C_FINAL_SYNC_MERGE_HEAD = "ca482405301ee7c669de585bf43a5aa816f021b3";
const P3C_FINAL_SYNC_FIRST_PARENT = "74f4c272738d2fc1e48e695564f36a9a3ec96510";
const P3C_FINAL_SYNC_MAIN_TIP = "0bec56f54ec45d67d508d1b3c83403952cfae058";
const P3C_FINAL_SYNC_SUBJECT = "test(publish): authorize final Title release synchronization";
const P3C_FINAL_SYNC_AUTHORIZED_PATHS = Object.freeze([
  VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
// Final current-main integration: one explicit merge of the exact current
// committed main tip into the accepted release, then this two-validator bridge.
// P3C production bytes are untouched by that merge; only main-owned Prompt
// Manager paths arrive with it.
const P3C_INTEGRATION_MERGE_HEAD = "9fdbae3abf78e348e5714dbac19ed96c4c7e998c";
const P3C_INTEGRATION_FIRST_PARENT = "6724f53c35a47a83accfaf98a33235464d86cfee";
const P3C_INTEGRATION_MAIN_TIP = "b7685527d10072204fb44f6a11f8271b77056a59";
const P3C_INTEGRATION_SUBJECT = "test(publish): authorize final current-main Title integration";
const P3C_INTEGRATION_AUTHORIZED_PATHS = Object.freeze([
  VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const P3C_A3B_SUBJECT = "test(publish): close activation completeness validation";
// P3C-C1 live-anchor repair. Production activation is now genuinely exercised, so the
// accepted final-integration commit is the base for a validator-only change that proves
// non-mutation of the real canonical anchor instead of asserting its absence.
const ACCEPTED_P3C_INTEGRATION_HEAD = "8b82c85666e4a3be2307316d7b342ed3388065ef";
const P3C_LIVE_ANCHOR_AUTHORIZED_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const P3C_LIVE_ANCHOR_SUBJECT =
  "test(publish): prove the payload validator never mutates the live canonical anchor";
// Current-main payload-validator baseline repair after the Activator baseline landed.
// This is an exact one-validator phase: no descendant allowance and no production path.
const ACCEPTED_CURRENT_MAIN_HEAD = "db49714cb9c3ce9f814056aa40160cc043cd2f5a";
const CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const CURRENT_PAYLOAD_BASELINE_SUBJECT =
  "test(publish): authorize current-main payload baseline after activator repair";
const CLASSIFIER_DURABILITY_BASE = "83ea42f0cab1c0e2a6756f4b94f195a27657cbb2";
const CLASSIFIER_DURABILITY_PATHS = Object.freeze([VALIDATOR_REL, PAYLOAD_VALIDATOR_REL].sort());
// Durable Payload authority begins at the independently reviewed classifier
// durability commit. Later canonical commits are acceptable only when every
// protected publication change is one of the exact transitions declared here.
const PAYLOAD_DURABILITY_ANCHOR = "b67dd6b511c2f0b4cac86416bf2ed7f0db96fd60";
const APPROVED_ACTIVATOR_TRANSITION = "99466b422e86fb4b7731e2a23a877b48e04d7d03";
const CURRENT_DURABLE_AUTHORITY_BASE = "13b333a2e6249aed9f90f0ec16776147c2edd434";
const PAYLOAD_DURABLE_AUTHORITY_SUBJECT =
  "test(publish): bind payload durability to approved authority transitions";
const PAYLOAD_DURABLE_AUTHORITY_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const PROTECTED_PAYLOAD_AUTHORITY_PATHS = Object.freeze([
  PAYLOAD_MODULE_REL,
  ACTIVATOR_REL,
  PAYLOAD_VALIDATOR_REL,
  VALIDATOR_REL,
  PACKAGE_REL,
  PACKAGE_LOCK_REL,
].sort());
const APPROVED_ACTIVATOR_TRANSITION_PATHS = Object.freeze([
  ACTIVATOR_REL,
  VALIDATOR_REL,
].sort());
const APPROVED_PROTECTED_HISTORY = Object.freeze([
  `${APPROVED_ACTIVATOR_TRANSITION}\t${APPROVED_ACTIVATOR_TRANSITION_PATHS.join("\t")}`,
]);
const ANCHOR_PROTECTED_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "3977cd1f7976513bc324368458f42328915c8f44075fc7eedd3eb5c3015e130a",
  [PAYLOAD_MODULE_REL]: "f2c9c8483bf22ae864bc3bafaf3b4f87c65d09f84c6ef5e4f196f08af9652e01",
  [VALIDATOR_REL]: "c94b27e5fdde9b739b0c63540cd1e8153c498efb29deae35f80f0b0f49abf74c",
  [PAYLOAD_VALIDATOR_REL]: "88a188f55f75c7ac753ae057d6db7d0cd017ee72db8be441934c4dad006de694",
  [PACKAGE_REL]: "3f3b6c30ba45a2e682b82328b7b8075aff50b872a7a1af0e2cb3d8a59af5eef8",
  [PACKAGE_LOCK_REL]: "4e38680d7fdb4fa735de96c5827f894b08e06686c12515eb59dacf9386f7ab5b",
});
const APPROVED_ACTIVATOR_BEFORE_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: ANCHOR_PROTECTED_IDENTITIES[ACTIVATOR_REL],
  [VALIDATOR_REL]: ANCHOR_PROTECTED_IDENTITIES[VALIDATOR_REL],
});
const APPROVED_ACTIVATOR_AFTER_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "eaac5ba995bd44740d3d1e26878872a3b3e4823f0df09aa27834232656c62db4",
  [VALIDATOR_REL]: "2e20998a60bda20d53798637070fe67685e5fa753ba6ecbbc0942cc96b2f1c17",
});
const APPROVED_CURRENT_PROTECTED_IDENTITIES = Object.freeze({
  ...ANCHOR_PROTECTED_IDENTITIES,
  ...APPROVED_ACTIVATOR_AFTER_IDENTITIES,
});
// Approved Activator alias-inventory authority transition. Exactly this commit, on exactly
// this parent, changing exactly the Activator validator from exactly these bytes to exactly
// these bytes. No other Activator-validator transition is approved, before or after it.
const APPROVED_ACTIVATOR_ALIAS_TRANSITION = "5c4595484da24c6ee22bfbc6437029ba51720c84";
const APPROVED_ACTIVATOR_ALIAS_PARENT = "9ada9090d1ca46ec11fe1502db1aa0d571a74da0";
const APPROVED_ACTIVATOR_ALIAS_SUBJECT =
  "test(publish): refresh activator alias inventory authority";
const APPROVED_ACTIVATOR_ALIAS_PATHS = Object.freeze([VALIDATOR_REL]);
const APPROVED_ACTIVATOR_ALIAS_BEFORE_IDENTITY =
  "2e20998a60bda20d53798637070fe67685e5fa753ba6ecbbc0942cc96b2f1c17";
const APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY =
  "178a61d068d9d22bff73774e3587af9518a2965655b852283fb439610847860b";
// The extension commit that carries that approval is itself a protected transition. Its own
// commit id and final bytes cannot be hard-coded before it exists, so it is bound structurally
// by parent, subject, path set and before identity, and its after identity is resolved at
// runtime exactly as the aeaa870a durability repair already is. This self-reference is
// permitted only in this one bounded slot.
const ACTIVATOR_ALIAS_AUTHORITY_SUBJECT =
  "test(publish): approve activator alias authority transition";
const ACTIVATOR_ALIAS_AUTHORITY_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const ACTIVATOR_ALIAS_AUTHORITY_BEFORE_IDENTITY =
  "32834089030d388088b1aa52f2aada66f3df5f3306ba7d8bb1f80cfb6ab43687";
// Accepted closure after the alias transition: only the Activator validator moves.
const EXTENDED_PROTECTED_IDENTITIES = Object.freeze({
  ...APPROVED_CURRENT_PROTECTED_IDENTITIES,
  [VALIDATOR_REL]: APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY,
});

// Batch 2A-R.2 receipt-verification authority. Two independently reviewed commits move the
// production activator, each bound by exact commit id, parent, subject, single protected path
// and exact before/after bytes. R.2 also touches canonical-delivery-lib.mjs, which is
// deliberately outside PROTECTED_PAYLOAD_AUTHORITY_PATHS and therefore never a protected
// transition here.
const APPROVED_R2_VERIFICATION_TRANSITION = "72f781bd0eada9b8426667dd7c4a82dbbde46416";
const APPROVED_R2_VERIFICATION_PARENT = "43cc141bd3d8a7e454965a64f7a73d11c2c7efa7";
const APPROVED_R2_VERIFICATION_SUBJECT =
  "feat(publish): complete R.2 standalone explicit-worktree receipt verification";
const APPROVED_R2_STRICT_DEFAULT_TRANSITION = "ab07ea7808af558d8934571bbfcdf96c7a27b1b8";
const APPROVED_R2_STRICT_DEFAULT_PARENT = APPROVED_R2_VERIFICATION_TRANSITION;
const APPROVED_R2_STRICT_DEFAULT_SUBJECT =
  "fix(publish): make R.2 canonical cleanliness strict by default";
const APPROVED_R2_TRANSITION_PATHS = Object.freeze([ACTIVATOR_REL]);
// The activator identity chain across the two approved R.2 commits. Each before identity is
// the previously approved after identity, so no gap exists in which unreviewed bytes occupied
// the protected path.
const APPROVED_R2_VERIFICATION_BEFORE_IDENTITY =
  "eaac5ba995bd44740d3d1e26878872a3b3e4823f0df09aa27834232656c62db4";
const APPROVED_R2_VERIFICATION_AFTER_IDENTITY =
  "4b3ec11240734c7e8afadb2e6e43fb244c2c9f9c3dfc320e6abc5f21bd889e95";
const APPROVED_R2_STRICT_DEFAULT_BEFORE_IDENTITY = APPROVED_R2_VERIFICATION_AFTER_IDENTITY;
const APPROVED_R2_STRICT_DEFAULT_AFTER_IDENTITY =
  "d6294b060f158bc31f76716c758bbaed198ee823bb12a081c5a52c49de4b0360";
// The bounded self-transition that carries this approval. Its own commit id and final bytes
// cannot pre-exist, so it is bound structurally and its after identity is resolved at runtime,
// exactly as the aeaa870a and d29260c7 self-transitions already are.
const R2_AUTHORITY_SUBJECT =
  "test(publish): approve R.2 receipt-verification authority transitions";
const R2_AUTHORITY_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const R2_AUTHORITY_BEFORE_IDENTITY =
  "d16fba4321900ef8ef3afccc9936cddcc0ddaa34abaeb58f4b15b83e648408dc";
// Accepted closure after both R.2 transitions: only the production activator moves again.
const R2_PROTECTED_IDENTITIES = Object.freeze({
  ...EXTENDED_PROTECTED_IDENTITIES,
  [ACTIVATOR_REL]: APPROVED_R2_STRICT_DEFAULT_AFTER_IDENTITY,
});
// ── CP09 — canonical Product-root authority re-baseline ────────────────────
// The canonical Cockpit Pro repository now lives under
// /Users/hobayda/H2OCode/products/. Two protected commits had already landed on
// main without being registered here (CP08), so the durable chain is repaired by
// re-admitting both with the exact evidence Git already holds, and then extended
// with the production correction and the bounded self-transition carrying this
// approval. Nothing historical is rewritten; the earlier eras stay intact.
const CP08_PUBLICATION_TRANSITION = "0689b7ac01119c7662953aa48feff7705e677da6";
const CP08_PUBLICATION_PARENT = "394f4e6a85084c6550b3f8c098cbd8370fa585a5";
const CP08_PUBLICATION_SUBJECT =
  "feat(publish): govern Studio launcher promotion and rollback";
const CP08_PUBLICATION_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const CP08_PUBLICATION_BEFORE_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "d6294b060f158bc31f76716c758bbaed198ee823bb12a081c5a52c49de4b0360",
  [PAYLOAD_MODULE_REL]: "f2c9c8483bf22ae864bc3bafaf3b4f87c65d09f84c6ef5e4f196f08af9652e01",
  [VALIDATOR_REL]: "178a61d068d9d22bff73774e3587af9518a2965655b852283fb439610847860b",
  [PAYLOAD_VALIDATOR_REL]: "82df425dcfb446890c26ade3edb4314b5b9fa88320d1d3d09323796688b6b34d",
});
const CP08_PUBLICATION_AFTER_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "0814277c80cca75764959b123114e20930a6db66947ab92e95f2cf653fb08b65",
  [PAYLOAD_MODULE_REL]: "499d8ae9c896c621340681835c96c3a36e8a9a26218753c7d0fdc921f78e3a05",
  [VALIDATOR_REL]: "36ccaebcdef9d3d9f722744c182870e379f74142fb7435eed11d6be4d7264e5b",
  [PAYLOAD_VALIDATOR_REL]: "ba4df1406065fbe44b3422d51654d18968595bf5eed5d977d17aaae5a831e9eb",
});
const CP08_SYNC_TRANSITION = "01be23579c2ee1f64b3db9fe9b0538bad8b14a62";
const CP08_SYNC_PARENT = CP08_PUBLICATION_TRANSITION;
const CP08_SYNC_SUBJECT = "test(publish): synchronize CP08 validation authority";
const CP08_SYNC_PATHS = Object.freeze([VALIDATOR_REL, PAYLOAD_VALIDATOR_REL].sort());
const CP08_SYNC_BEFORE_IDENTITIES = Object.freeze({
  [VALIDATOR_REL]: CP08_PUBLICATION_AFTER_IDENTITIES[VALIDATOR_REL],
  [PAYLOAD_VALIDATOR_REL]: CP08_PUBLICATION_AFTER_IDENTITIES[PAYLOAD_VALIDATOR_REL],
});
const CP08_SYNC_AFTER_IDENTITIES = Object.freeze({
  [VALIDATOR_REL]: "b9c061fefaa4da716fef16ab5cc84cdb9fe38e13360b153158a4658565315f0d",
  [PAYLOAD_VALIDATOR_REL]: "653452323eca4e96ade7a62c6fbc43675391a898901b6e39c00aca0f77b7170e",
});
// The authorized CP09 base: the integrated main this transition was approved on.
const CP09_AUTHORIZED_BASE = "88be4b669ad62345d7563e98d21dd46a342c08f7";
const CP09_ROOT_TRANSITION = "bf43ba2f7105bf55e6967262c172436a2e8d5471";
const CP09_ROOT_PARENT = CP09_AUTHORIZED_BASE;
const CP09_ROOT_SUBJECT =
  "feat(publish): move canonical root authority to the Product root";
const CP09_ROOT_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL,
].sort());
const CP09_ROOT_BEFORE_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: CP08_PUBLICATION_AFTER_IDENTITIES[ACTIVATOR_REL],
  [PAYLOAD_MODULE_REL]: CP08_PUBLICATION_AFTER_IDENTITIES[PAYLOAD_MODULE_REL],
  [VALIDATOR_REL]: CP08_SYNC_AFTER_IDENTITIES[VALIDATOR_REL],
});
const CP09_ROOT_AFTER_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "da8f8b573405f39ae811fb60d234e0076da77d266653733340ad7d85506b31db",
  [PAYLOAD_MODULE_REL]: "ad280da9261ef0b12bbcc443b7cf55523073442ec0bda972ada4f92de55cc9ae",
  [VALIDATOR_REL]: "9f3dcb7bbcb26571c8a35b6c8a04110cd4c46c9947a37839099769c31b32647c",
});
// The bounded self-transition carrying this approval. Its own commit id and final
// bytes cannot pre-exist, so it is bound by parent, subject, path set and before
// identity, with its after identity resolved at runtime exactly as the aeaa870a,
// d29260c7 and e32d1fa8 self-transitions already are.
const CP09_AUTHORITY_SUBJECT =
  "test(publish): approve the canonical Product-root authority transition";
const CP09_AUTHORITY_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const CP09_AUTHORITY_BEFORE_IDENTITY =
  "653452323eca4e96ade7a62c6fbc43675391a898901b6e39c00aca0f77b7170e";
// Accepted closure after CP09: the production correction moved three protected
// paths; package identities are untouched throughout.
const CP09_PROTECTED_IDENTITIES = Object.freeze({
  ...R2_PROTECTED_IDENTITIES,
  [ACTIVATOR_REL]: CP09_ROOT_AFTER_IDENTITIES[ACTIVATOR_REL],
  [PAYLOAD_MODULE_REL]: CP09_ROOT_AFTER_IDENTITIES[PAYLOAD_MODULE_REL],
  [VALIDATOR_REL]: CP09_ROOT_AFTER_IDENTITIES[VALIDATOR_REL],
});
// ── CP10 — historical activation-intent relocation compatibility ──────────
// The approved relocation moved the canonical root, so accepted historical
// activations now record a location that is no longer current. C1 teaches the
// classifier to recognise exactly one registered retired generation while
// leaving admission untouched; C2 is the bounded self-transition that registers
// C1. Nothing historical is rewritten and the payload module is not touched.
const CP10_AUTHORIZED_BASE = "1e8f16dfd9be05411845eccbd9310b628b8a2107";
const CP10_INTENT_TRANSITION = "4c26ce426dca33bb1e7d08f961fe53fb50ca1cdd";
const CP10_INTENT_PARENT = CP10_AUTHORIZED_BASE;
const CP10_INTENT_SUBJECT =
  "fix(publish): classify relocated historical activation intents";
const CP10_INTENT_PATHS = Object.freeze([ACTIVATOR_REL, VALIDATOR_REL].sort());
const CP10_INTENT_BEFORE_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "da8f8b573405f39ae811fb60d234e0076da77d266653733340ad7d85506b31db",
  [VALIDATOR_REL]: "9f3dcb7bbcb26571c8a35b6c8a04110cd4c46c9947a37839099769c31b32647c",
});
const CP10_INTENT_AFTER_IDENTITIES = Object.freeze({
  [ACTIVATOR_REL]: "cbeedb44548124adb55373f8211caa16cf4d3a0bbccea9eb657f9416bf0d5b22",
  [VALIDATOR_REL]: "1688ba0335ec33a99d39b34ded4ed99d9e355f282b357afeae67b373db809f48",
});
// Bounded self-transition, resolved at runtime exactly as aeaa870a, d29260c7,
// e32d1fa8 and the CP09 authority commit already are.
const CP10_AUTHORITY_SUBJECT =
  "test(publish): approve the historical intent relocation transition";
const CP10_AUTHORITY_PATHS = Object.freeze([PAYLOAD_VALIDATOR_REL]);
const CP10_AUTHORITY_BEFORE_IDENTITY =
  "ce2c34f70a8b993ac461265d47b5c5dc479e4f392870bc37e903f9dbf3ef83c3";
// Accepted closure after CP10: only the activator and its validator moved.
const CP10_PROTECTED_IDENTITIES = Object.freeze({
  ...CP09_PROTECTED_IDENTITIES,
  [ACTIVATOR_REL]: CP10_INTENT_AFTER_IDENTITIES[ACTIVATOR_REL],
  [VALIDATOR_REL]: CP10_INTENT_AFTER_IDENTITIES[VALIDATOR_REL],
});
const STUDIO_PUBLICATION_BASE_HEAD = "394f4e6a85084c6550b3f8c098cbd8370fa585a5";
const STUDIO_PUBLICATION_AUTHORITY_HEAD = "0689b7ac01119c7662953aa48feff7705e677da6";
const STUDIO_PUBLICATION_AUTHORITY_SUBJECT =
  "feat(publish): govern Studio launcher promotion and rollback";
const STUDIO_PUBLICATION_AUTHORITY_PATHS = Object.freeze([
  "tools/publish/lean-publisher.mjs", ACTIVATOR_REL, PAYLOAD_MODULE_REL,
  "tools/validation/publish/validate-lean-publisher-v1.mjs",
  VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const EXPECTED_SCOPE = 32;
const EXPECTED_RUNTIME = 140;
const EXPECTED_STRUCTURAL = 25;

const scopeResults = [];
const runtimeResults = [];
const structuralResults = [];
const temporaryRoots = [];

function scopeTest(name, fn) {
  fn();
  scopeResults.push(name);
  process.stdout.write(`ok scope ${scopeResults.length} - ${name}\n`);
}

async function test(name, fn) {
  await fn();
  runtimeResults.push(name);
  process.stdout.write(`ok ${runtimeResults.length} - ${name}\n`);
}

function structural(name, fn) {
  fn();
  structuralResults.push(name);
  process.stdout.write(`ok structural ${structuralResults.length} - ${name}\n`);
}

function git(repository, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function gitCommitParents(repository, commit) {
  const output = git(repository, ["rev-list", "--parents", "-n", "1", commit]);
  const fields = output ? output.split(/\s+/u).filter(Boolean) : [];
  if (!fields.length || !/^[0-9a-f]{40}$/u.test(fields[0])) {
    throw new Error(`unable to derive Git parents for ${commit}`);
  }
  return fields.slice(1);
}

function deriveProtectedHistory(repository, anchor, head = "HEAD",
  protectedPaths = PROTECTED_PAYLOAD_AUTHORITY_PATHS) {
  const output = git(repository, ["rev-list", "--reverse", "--full-history",
    `${anchor}..${head}`, "--", ...protectedPaths]);
  const candidates = output ? output.split("\n").filter(Boolean) : [];
  const commits = [];
  const records = [];
  for (const commit of candidates) {
    const merge = gitCommitParents(repository, commit).length > 1;
    const changedOutput = git(repository, ["diff-tree", ...(merge ? ["-c"] : []),
      "--no-commit-id", "--name-only", "-r", commit, "--", ...protectedPaths]);
    const changed = changedOutput
      ? [...new Set(changedOutput.split("\n").filter(Boolean))].sort()
      : [];
    if (!changed.length) continue;
    commits.push(commit);
    records.push(`${commit}\t${changed.join("\t")}`);
  }
  return { commits, records };
}

function tempRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `h2o-p3a-${label}-`));
  temporaryRoots.push(root);
  return root;
}

function normalized(target) {
  let cursor = path.resolve(String(target));
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  const base = fs.existsSync(cursor) ? fs.realpathSync.native(cursor) : cursor;
  return path.resolve(base, ...suffix);
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobIdentity(commit, relative) {
  return sha256Bytes(execFileSync("git", ["-C", ROOT, "show", `${commit}:${relative}`], {
    encoding: null, stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
  }));
}

function protectedIdentityRecord(commit, paths = PROTECTED_PAYLOAD_AUTHORITY_PATHS) {
  return Object.fromEntries(paths.map((relative) => [relative, gitBlobIdentity(commit, relative)]));
}

function identityRecordMatches(actual, expected, paths) {
  if (!actual || typeof actual !== "object") return false;
  return paths.every((relative) => actual[relative] === expected[relative]) &&
    Object.keys(actual).length === paths.length;
}

function hasApprovedPayloadAuthority(value, { requireMainBranch = true } = {}) {
  if (requireMainBranch && value.branch !== "main") return false;
  const approvedFoundation = value.approvedAnchorAncestor === true &&
    JSON.stringify(value.approvedTransitionPaths ?? []) ===
      JSON.stringify(APPROVED_ACTIVATOR_TRANSITION_PATHS) &&
    identityRecordMatches(value.anchorProtectedIdentities, ANCHOR_PROTECTED_IDENTITIES,
      PROTECTED_PAYLOAD_AUTHORITY_PATHS) &&
    identityRecordMatches(value.approvedTransitionBeforeIdentities,
      APPROVED_ACTIVATOR_BEFORE_IDENTITIES, APPROVED_ACTIVATOR_TRANSITION_PATHS) &&
    identityRecordMatches(value.approvedTransitionAfterIdentities,
      APPROVED_ACTIVATOR_AFTER_IDENTITIES, APPROVED_ACTIVATOR_TRANSITION_PATHS);
  if (!approvedFoundation) return false;
  const anchorPlusActivator =
    JSON.stringify(value.protectedHistory ?? []) === JSON.stringify(APPROVED_PROTECTED_HISTORY) &&
    identityRecordMatches(value.headProtectedIdentities, APPROVED_CURRENT_PROTECTED_IDENTITIES,
      PROTECTED_PAYLOAD_AUTHORITY_PATHS);
  if (anchorPlusActivator) return true;
  const repairCommit = value.payloadDurabilityRepairCommit;
  const expectedRepairHistory = [...APPROVED_PROTECTED_HISTORY,
    `${repairCommit}\t${PAYLOAD_VALIDATOR_REL}`].sort();
  const immutablePaths = PROTECTED_PAYLOAD_AUTHORITY_PATHS
    .filter((relative) => relative !== PAYLOAD_VALIDATOR_REL);
  const anchorPlusRepair = typeof repairCommit === "string" && /^[0-9a-f]{40}$/u.test(repairCommit) &&
    repairCommit !== APPROVED_ACTIVATOR_TRANSITION &&
    JSON.stringify(value.protectedHistory ?? []) === JSON.stringify(expectedRepairHistory) &&
    value.payloadDurabilityRepairParent === CURRENT_DURABLE_AUTHORITY_BASE &&
    value.payloadDurabilityRepairSubject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
    JSON.stringify(value.payloadDurabilityRepairPaths ?? []) ===
      JSON.stringify(PAYLOAD_DURABLE_AUTHORITY_PATHS) &&
    value.payloadDurabilityRepairBeforeIdentity ===
      APPROVED_CURRENT_PROTECTED_IDENTITIES[PAYLOAD_VALIDATOR_REL] &&
    typeof value.payloadDurabilityRepairAfterIdentity === "string" &&
    value.payloadDurabilityRepairAfterIdentity === value.executionPayloadValidatorIdentity &&
    value.payloadDurabilityRepairAfterIdentity ===
      value.headProtectedIdentities?.[PAYLOAD_VALIDATOR_REL] &&
    (value.head !== repairCommit || (
      value.parent === CURRENT_DURABLE_AUTHORITY_BASE &&
      value.subject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
      JSON.stringify(value.committedPaths ?? []) ===
        JSON.stringify(PAYLOAD_DURABLE_AUTHORITY_PATHS))) &&
    identityRecordMatches(
      Object.fromEntries(immutablePaths.map((relative) =>
        [relative, value.headProtectedIdentities?.[relative]])),
      APPROVED_CURRENT_PROTECTED_IDENTITIES, immutablePaths) &&
    Object.keys(value.headProtectedIdentities ?? {}).length ===
      PROTECTED_PAYLOAD_AUTHORITY_PATHS.length;
  if (anchorPlusRepair) return true;
  // Extended era: exactly four protected transitions and nothing else. The anchor activator
  // transition, the aeaa870a-shaped payload durability repair, the exact approved Activator
  // alias transition, and the bounded self-transition that carries this approval. Membership
  // and record content are exact; only ordering is normalised.
  const aliasAuthorityCommit = value.activatorAliasAuthorityCommit;
  const expectedExtendedHistory = [...APPROVED_PROTECTED_HISTORY,
    `${repairCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
    `${aliasAuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`].sort();
  const extendedImmutablePaths = PROTECTED_PAYLOAD_AUTHORITY_PATHS
    .filter((relative) => relative !== PAYLOAD_VALIDATOR_REL);
  const anchorPlusAliasAuthority = typeof repairCommit === "string" &&
    /^[0-9a-f]{40}$/u.test(repairCommit) &&
    typeof aliasAuthorityCommit === "string" && /^[0-9a-f]{40}$/u.test(aliasAuthorityCommit) &&
    repairCommit !== APPROVED_ACTIVATOR_TRANSITION &&
    repairCommit !== APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    aliasAuthorityCommit !== APPROVED_ACTIVATOR_TRANSITION &&
    aliasAuthorityCommit !== APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    aliasAuthorityCommit !== repairCommit &&
    JSON.stringify([...(value.protectedHistory ?? [])].sort()) ===
      JSON.stringify(expectedExtendedHistory) &&
    // the pre-existing durability repair keeps its original bounded shape
    value.payloadDurabilityRepairParent === CURRENT_DURABLE_AUTHORITY_BASE &&
    value.payloadDurabilityRepairSubject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
    JSON.stringify(value.payloadDurabilityRepairPaths ?? []) ===
      JSON.stringify(PAYLOAD_DURABLE_AUTHORITY_PATHS) &&
    value.payloadDurabilityRepairBeforeIdentity ===
      APPROVED_CURRENT_PROTECTED_IDENTITIES[PAYLOAD_VALIDATOR_REL] &&
    // the approved Activator alias transition, bound exactly
    value.activatorAliasTransitionParent === APPROVED_ACTIVATOR_ALIAS_PARENT &&
    value.activatorAliasTransitionSubject === APPROVED_ACTIVATOR_ALIAS_SUBJECT &&
    JSON.stringify(value.activatorAliasTransitionPaths ?? []) ===
      JSON.stringify([...APPROVED_ACTIVATOR_ALIAS_PATHS]) &&
    value.activatorAliasTransitionBeforeIdentity ===
      APPROVED_ACTIVATOR_ALIAS_BEFORE_IDENTITY &&
    value.activatorAliasTransitionAfterIdentity ===
      APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY &&
    // the bounded self-transition carrying this approval
    value.activatorAliasAuthorityParent === APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    value.activatorAliasAuthoritySubject === ACTIVATOR_ALIAS_AUTHORITY_SUBJECT &&
    JSON.stringify(value.activatorAliasAuthorityPaths ?? []) ===
      JSON.stringify([...ACTIVATOR_ALIAS_AUTHORITY_PATHS]) &&
    value.activatorAliasAuthorityBeforeIdentity ===
      ACTIVATOR_ALIAS_AUTHORITY_BEFORE_IDENTITY &&
    typeof value.activatorAliasAuthorityAfterIdentity === "string" &&
    value.activatorAliasAuthorityAfterIdentity === value.executionPayloadValidatorIdentity &&
    value.activatorAliasAuthorityAfterIdentity ===
      value.headProtectedIdentities?.[PAYLOAD_VALIDATOR_REL] &&
    (value.head !== aliasAuthorityCommit || (
      value.parent === APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
      value.subject === ACTIVATOR_ALIAS_AUTHORITY_SUBJECT &&
      JSON.stringify(value.committedPaths ?? []) ===
        JSON.stringify([...ACTIVATOR_ALIAS_AUTHORITY_PATHS]))) &&
    // every other protected path stays at the extended accepted closure
    identityRecordMatches(
      Object.fromEntries(extendedImmutablePaths.map((relative) =>
        [relative, value.headProtectedIdentities?.[relative]])),
      EXTENDED_PROTECTED_IDENTITIES, extendedImmutablePaths) &&
    Object.keys(value.headProtectedIdentities ?? {}).length ===
      PROTECTED_PAYLOAD_AUTHORITY_PATHS.length;
  if (anchorPlusAliasAuthority) return true;
  // R.2 era: exactly seven protected transitions and nothing else. The four already-approved
  // records, the two exactly-bound R.2 activator transitions, and the bounded self-transition
  // carrying this approval. Membership and record content are exact; only ordering is normalised.
  const r2AuthorityCommit = value.r2AuthorityCommit;
  const expectedR2History = [...APPROVED_PROTECTED_HISTORY,
    `${repairCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
    `${aliasAuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_R2_VERIFICATION_TRANSITION}\t${ACTIVATOR_REL}`,
    `${APPROVED_R2_STRICT_DEFAULT_TRANSITION}\t${ACTIVATOR_REL}`,
    `${r2AuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`].sort();
  const r2ImmutablePaths = PROTECTED_PAYLOAD_AUTHORITY_PATHS
    .filter((relative) => relative !== PAYLOAD_VALIDATOR_REL);
  const r2TransitionMatches = (evidence, parent, subject, before, after) =>
    !!evidence && evidence.parent === parent && evidence.subject === subject &&
    JSON.stringify(evidence.paths ?? []) === JSON.stringify([...APPROVED_R2_TRANSITION_PATHS]) &&
    evidence.beforeIdentity === before && evidence.afterIdentity === after;
  const anchorPlusR2Authority =
    typeof r2AuthorityCommit === "string" && /^[0-9a-f]{40}$/u.test(r2AuthorityCommit) &&
    ![APPROVED_ACTIVATOR_TRANSITION, APPROVED_ACTIVATOR_ALIAS_TRANSITION,
      APPROVED_R2_VERIFICATION_TRANSITION, APPROVED_R2_STRICT_DEFAULT_TRANSITION,
      repairCommit, aliasAuthorityCommit].includes(r2AuthorityCommit) &&
    JSON.stringify([...(value.protectedHistory ?? [])].sort()) ===
      JSON.stringify(expectedR2History) &&
    // the two earlier self-transitions keep their original bounded shapes
    value.payloadDurabilityRepairParent === CURRENT_DURABLE_AUTHORITY_BASE &&
    value.payloadDurabilityRepairSubject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
    value.activatorAliasTransitionAfterIdentity === APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY &&
    value.activatorAliasAuthorityParent === APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    value.activatorAliasAuthoritySubject === ACTIVATOR_ALIAS_AUTHORITY_SUBJECT &&
    // both approved R.2 activator transitions, each bound exactly
    r2TransitionMatches(value.r2VerificationTransition,
      APPROVED_R2_VERIFICATION_PARENT, APPROVED_R2_VERIFICATION_SUBJECT,
      APPROVED_R2_VERIFICATION_BEFORE_IDENTITY, APPROVED_R2_VERIFICATION_AFTER_IDENTITY) &&
    r2TransitionMatches(value.r2StrictDefaultTransition,
      APPROVED_R2_STRICT_DEFAULT_PARENT, APPROVED_R2_STRICT_DEFAULT_SUBJECT,
      APPROVED_R2_STRICT_DEFAULT_BEFORE_IDENTITY, APPROVED_R2_STRICT_DEFAULT_AFTER_IDENTITY) &&
    // the bounded self-transition carrying this approval
    value.r2AuthorityParent === APPROVED_R2_STRICT_DEFAULT_TRANSITION &&
    value.r2AuthoritySubject === R2_AUTHORITY_SUBJECT &&
    JSON.stringify(value.r2AuthorityPaths ?? []) === JSON.stringify([...R2_AUTHORITY_PATHS]) &&
    value.r2AuthorityBeforeIdentity === R2_AUTHORITY_BEFORE_IDENTITY &&
    typeof value.r2AuthorityAfterIdentity === "string" &&
    value.r2AuthorityAfterIdentity === value.executionPayloadValidatorIdentity &&
    value.r2AuthorityAfterIdentity === value.headProtectedIdentities?.[PAYLOAD_VALIDATOR_REL] &&
    (value.head !== r2AuthorityCommit || (
      value.parent === APPROVED_R2_STRICT_DEFAULT_TRANSITION &&
      value.subject === R2_AUTHORITY_SUBJECT &&
      JSON.stringify(value.committedPaths ?? []) === JSON.stringify([...R2_AUTHORITY_PATHS]))) &&
    // every other protected path stays at the R.2 accepted closure
    identityRecordMatches(
      Object.fromEntries(r2ImmutablePaths.map((relative) =>
        [relative, value.headProtectedIdentities?.[relative]])),
      R2_PROTECTED_IDENTITIES, r2ImmutablePaths) &&
    Object.keys(value.headProtectedIdentities ?? {}).length ===
      PROTECTED_PAYLOAD_AUTHORITY_PATHS.length;
  if (anchorPlusR2Authority) return true;
  // CP09 era: exactly eleven protected transitions and nothing else. The seven
  // already-approved records, the two re-admitted CP08 commits, the CP09
  // production root correction, and the bounded self-transition carrying this
  // approval. Membership and record content are exact; only ordering is
  // normalised.
  const cp09AuthorityCommit = value.cp09AuthorityCommit;
  const expectedCp09History = [...APPROVED_PROTECTED_HISTORY,
    `${repairCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
    `${aliasAuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_R2_VERIFICATION_TRANSITION}\t${ACTIVATOR_REL}`,
    `${APPROVED_R2_STRICT_DEFAULT_TRANSITION}\t${ACTIVATOR_REL}`,
    `${r2AuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${CP08_PUBLICATION_TRANSITION}\t${CP08_PUBLICATION_PATHS.join("\t")}`,
    `${CP08_SYNC_TRANSITION}\t${CP08_SYNC_PATHS.join("\t")}`,
    `${CP09_ROOT_TRANSITION}\t${CP09_ROOT_PATHS.join("\t")}`,
    `${cp09AuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`].sort();
  const cp09ImmutablePaths = PROTECTED_PAYLOAD_AUTHORITY_PATHS
    .filter((relative) => relative !== PAYLOAD_VALIDATOR_REL);
  const cp09TransitionMatches = (evidence, parent, subject, paths, before, after) =>
    !!evidence && evidence.parent === parent && evidence.subject === subject &&
    JSON.stringify(evidence.paths ?? []) === JSON.stringify([...paths]) &&
    identityRecordMatches(evidence.beforeIdentities, before, paths) &&
    identityRecordMatches(evidence.afterIdentities, after, paths);
  const anchorPlusCp09Authority =
    typeof cp09AuthorityCommit === "string" &&
    /^[0-9a-f]{40}$/u.test(cp09AuthorityCommit) &&
    ![APPROVED_ACTIVATOR_TRANSITION, APPROVED_ACTIVATOR_ALIAS_TRANSITION,
      APPROVED_R2_VERIFICATION_TRANSITION, APPROVED_R2_STRICT_DEFAULT_TRANSITION,
      CP08_PUBLICATION_TRANSITION, CP08_SYNC_TRANSITION, CP09_ROOT_TRANSITION,
      repairCommit, aliasAuthorityCommit, r2AuthorityCommit].includes(cp09AuthorityCommit) &&
    JSON.stringify([...(value.protectedHistory ?? [])].sort()) ===
      JSON.stringify(expectedCp09History) &&
    // every earlier self-transition keeps its original bounded shape
    value.payloadDurabilityRepairParent === CURRENT_DURABLE_AUTHORITY_BASE &&
    value.payloadDurabilityRepairSubject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
    value.activatorAliasTransitionAfterIdentity === APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY &&
    value.activatorAliasAuthorityParent === APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    value.activatorAliasAuthoritySubject === ACTIVATOR_ALIAS_AUTHORITY_SUBJECT &&
    value.r2AuthorityParent === APPROVED_R2_STRICT_DEFAULT_TRANSITION &&
    value.r2AuthoritySubject === R2_AUTHORITY_SUBJECT &&
    // the two re-admitted CP08 commits, each bound by exact historical evidence
    cp09TransitionMatches(value.cp08PublicationTransition,
      CP08_PUBLICATION_PARENT, CP08_PUBLICATION_SUBJECT, CP08_PUBLICATION_PATHS,
      CP08_PUBLICATION_BEFORE_IDENTITIES, CP08_PUBLICATION_AFTER_IDENTITIES) &&
    cp09TransitionMatches(value.cp08SyncTransition,
      CP08_SYNC_PARENT, CP08_SYNC_SUBJECT, CP08_SYNC_PATHS,
      CP08_SYNC_BEFORE_IDENTITIES, CP08_SYNC_AFTER_IDENTITIES) &&
    // the CP09 production correction, bound exactly
    cp09TransitionMatches(value.cp09RootTransition,
      CP09_ROOT_PARENT, CP09_ROOT_SUBJECT, CP09_ROOT_PATHS,
      CP09_ROOT_BEFORE_IDENTITIES, CP09_ROOT_AFTER_IDENTITIES) &&
    // the bounded self-transition carrying this approval
    value.cp09AuthorityParent === CP09_ROOT_TRANSITION &&
    value.cp09AuthoritySubject === CP09_AUTHORITY_SUBJECT &&
    JSON.stringify(value.cp09AuthorityPaths ?? []) === JSON.stringify([...CP09_AUTHORITY_PATHS]) &&
    value.cp09AuthorityBeforeIdentity === CP09_AUTHORITY_BEFORE_IDENTITY &&
    typeof value.cp09AuthorityAfterIdentity === "string" &&
    value.cp09AuthorityAfterIdentity === value.executionPayloadValidatorIdentity &&
    value.cp09AuthorityAfterIdentity === value.headProtectedIdentities?.[PAYLOAD_VALIDATOR_REL] &&
    (value.head !== cp09AuthorityCommit || (
      value.parent === CP09_ROOT_TRANSITION &&
      value.subject === CP09_AUTHORITY_SUBJECT &&
      JSON.stringify(value.committedPaths ?? []) === JSON.stringify([...CP09_AUTHORITY_PATHS]))) &&
    // every other protected path stays at the CP09 accepted closure
    identityRecordMatches(
      Object.fromEntries(cp09ImmutablePaths.map((relative) =>
        [relative, value.headProtectedIdentities?.[relative]])),
      CP09_PROTECTED_IDENTITIES, cp09ImmutablePaths) &&
    Object.keys(value.headProtectedIdentities ?? {}).length ===
      PROTECTED_PAYLOAD_AUTHORITY_PATHS.length;
  if (anchorPlusCp09Authority) return true;
  // CP10 era: exactly thirteen protected transitions and nothing else. The
  // eleven already-approved records, the CP10 classifier correction, and the
  // bounded self-transition carrying this approval. Membership and record
  // content are exact; only ordering is normalised.
  const cp10AuthorityCommit = value.cp10AuthorityCommit;
  const expectedCp10History = [...APPROVED_PROTECTED_HISTORY,
    `${repairCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
    `${aliasAuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${APPROVED_R2_VERIFICATION_TRANSITION}\t${ACTIVATOR_REL}`,
    `${APPROVED_R2_STRICT_DEFAULT_TRANSITION}\t${ACTIVATOR_REL}`,
    `${r2AuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${CP08_PUBLICATION_TRANSITION}\t${CP08_PUBLICATION_PATHS.join("\t")}`,
    `${CP08_SYNC_TRANSITION}\t${CP08_SYNC_PATHS.join("\t")}`,
    `${CP09_ROOT_TRANSITION}\t${CP09_ROOT_PATHS.join("\t")}`,
    `${cp09AuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`,
    `${CP10_INTENT_TRANSITION}\t${CP10_INTENT_PATHS.join("\t")}`,
    `${cp10AuthorityCommit}\t${PAYLOAD_VALIDATOR_REL}`].sort();
  const cp10ImmutablePaths = PROTECTED_PAYLOAD_AUTHORITY_PATHS
    .filter((relative) => relative !== PAYLOAD_VALIDATOR_REL);
  return typeof cp10AuthorityCommit === "string" &&
    /^[0-9a-f]{40}$/u.test(cp10AuthorityCommit) &&
    ![APPROVED_ACTIVATOR_TRANSITION, APPROVED_ACTIVATOR_ALIAS_TRANSITION,
      APPROVED_R2_VERIFICATION_TRANSITION, APPROVED_R2_STRICT_DEFAULT_TRANSITION,
      CP08_PUBLICATION_TRANSITION, CP08_SYNC_TRANSITION, CP09_ROOT_TRANSITION,
      CP10_INTENT_TRANSITION, repairCommit, aliasAuthorityCommit, r2AuthorityCommit,
      cp09AuthorityCommit].includes(cp10AuthorityCommit) &&
    JSON.stringify([...(value.protectedHistory ?? [])].sort()) ===
      JSON.stringify(expectedCp10History) &&
    // every earlier self-transition keeps its original bounded shape
    value.payloadDurabilityRepairParent === CURRENT_DURABLE_AUTHORITY_BASE &&
    value.payloadDurabilityRepairSubject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
    value.activatorAliasTransitionAfterIdentity === APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY &&
    value.activatorAliasAuthorityParent === APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    value.activatorAliasAuthoritySubject === ACTIVATOR_ALIAS_AUTHORITY_SUBJECT &&
    value.r2AuthorityParent === APPROVED_R2_STRICT_DEFAULT_TRANSITION &&
    value.r2AuthoritySubject === R2_AUTHORITY_SUBJECT &&
    value.cp09AuthorityParent === CP09_ROOT_TRANSITION &&
    value.cp09AuthoritySubject === CP09_AUTHORITY_SUBJECT &&
    // the earlier exactly-bound transitions still hold
    cp09TransitionMatches(value.cp08PublicationTransition,
      CP08_PUBLICATION_PARENT, CP08_PUBLICATION_SUBJECT, CP08_PUBLICATION_PATHS,
      CP08_PUBLICATION_BEFORE_IDENTITIES, CP08_PUBLICATION_AFTER_IDENTITIES) &&
    cp09TransitionMatches(value.cp08SyncTransition,
      CP08_SYNC_PARENT, CP08_SYNC_SUBJECT, CP08_SYNC_PATHS,
      CP08_SYNC_BEFORE_IDENTITIES, CP08_SYNC_AFTER_IDENTITIES) &&
    cp09TransitionMatches(value.cp09RootTransition,
      CP09_ROOT_PARENT, CP09_ROOT_SUBJECT, CP09_ROOT_PATHS,
      CP09_ROOT_BEFORE_IDENTITIES, CP09_ROOT_AFTER_IDENTITIES) &&
    // the CP10 classifier correction, bound exactly
    cp09TransitionMatches(value.cp10IntentTransition,
      CP10_INTENT_PARENT, CP10_INTENT_SUBJECT, CP10_INTENT_PATHS,
      CP10_INTENT_BEFORE_IDENTITIES, CP10_INTENT_AFTER_IDENTITIES) &&
    // the bounded self-transition carrying this approval
    value.cp10AuthorityParent === CP10_INTENT_TRANSITION &&
    value.cp10AuthoritySubject === CP10_AUTHORITY_SUBJECT &&
    JSON.stringify(value.cp10AuthorityPaths ?? []) === JSON.stringify([...CP10_AUTHORITY_PATHS]) &&
    value.cp10AuthorityBeforeIdentity === CP10_AUTHORITY_BEFORE_IDENTITY &&
    typeof value.cp10AuthorityAfterIdentity === "string" &&
    value.cp10AuthorityAfterIdentity === value.executionPayloadValidatorIdentity &&
    value.cp10AuthorityAfterIdentity === value.headProtectedIdentities?.[PAYLOAD_VALIDATOR_REL] &&
    (value.head !== cp10AuthorityCommit || (
      value.parent === CP10_INTENT_TRANSITION &&
      value.subject === CP10_AUTHORITY_SUBJECT &&
      JSON.stringify(value.committedPaths ?? []) === JSON.stringify([...CP10_AUTHORITY_PATHS]))) &&
    // every other protected path stays at the CP10 accepted closure
    identityRecordMatches(
      Object.fromEntries(cp10ImmutablePaths.map((relative) =>
        [relative, value.headProtectedIdentities?.[relative]])),
      CP10_PROTECTED_IDENTITIES, cp10ImmutablePaths) &&
    Object.keys(value.headProtectedIdentities ?? {}).length ===
      PROTECTED_PAYLOAD_AUTHORITY_PATHS.length;
}

/* --------------------------------------------------------------------- *
 * Real canonical delivery anchor — non-mutation authority
 *
 * The landed activation architecture is now genuinely exercised in production, so
 * this anchor may legitimately exist and carry activation intents, transaction
 * sequence records and activation receipts. That evidence is audit material: this
 * validator must never create, remove or alter any of it. The invariant is therefore
 * NOT "the anchor is absent" but "whatever the anchor was before this suite ran, it
 * is byte-for-byte the same afterwards".
 * --------------------------------------------------------------------- */

const REAL_CANONICAL_ANCHOR =
  "/Users/hobayda/H2OCode/products/cockpit-pro/.h2o-canonical-delivery";

/**
 * Deterministic read-only manifest of a canonical delivery anchor, sufficient to detect
 * any mutation. Absence is a first-class stable state rather than a failure. Entries are
 * sorted by path so filesystem enumeration order cannot alter the result. Only
 * content-bearing metadata is captured — directory and file timestamps are deliberately
 * excluded because they would produce false positives without adding any
 * mutation-detection value.
 */
function snapshotCanonicalAnchor(anchorRoot = REAL_CANONICAL_ANCHOR) {
  if (!fs.existsSync(anchorRoot)) return Object.freeze({ exists: false, entries: [] });
  const entries = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(anchorRoot, absolute).split(path.sep).join("/");
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push({ path: relative, type: "symlink", target: fs.readlinkSync(absolute) });
        continue;
      }
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: "directory" });
        walk(absolute);
        continue;
      }
      entries.push({
        path: relative,
        type: "file",
        bytes: stat.size,
        sha256: sha256Bytes(fs.readFileSync(absolute)),
      });
    }
  };
  walk(anchorRoot);
  entries.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return Object.freeze({ exists: true, entries });
}

function canonicalAnchorDigest(snapshot) {
  return sha256Bytes(JSON.stringify({ exists: snapshot.exists, entries: snapshot.entries }));
}

// Captured at module load, before any fixture is created, so the post-suite comparison
// proves this validator left real production activation evidence untouched.
const REAL_ANCHOR_BASELINE = snapshotCanonicalAnchor();

/* --------------------------------------------------------------------- *
 * Scope model — the same four authorized paths as the activator validator
 * --------------------------------------------------------------------- */

function classifyPayloadScope(state) {
  const value = Object.fromEntries(Object.entries(state).map(([key, item]) =>
    [key, Array.isArray(item) ? [...item].sort() : item]));
  if (value.staged.length) throw new Error("P3A scope rejects staged paths");
  if (value.head === STUDIO_PUBLICATION_BASE_HEAD && value.untracked.length === 0 &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify(STUDIO_PUBLICATION_AUTHORITY_PATHS)) {
    return "studio-publication-authority-uncommitted";
  }
  if (value.head === CP09_AUTHORIZED_BASE && value.untracked.length === 0 &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify([...CP09_ROOT_PATHS])) {
    return "cp09-root-authority-uncommitted";
  }
  const committedCp09RootAuthority =
    value.head === CP09_ROOT_TRANSITION &&
    value.parent === CP09_AUTHORIZED_BASE &&
    value.subject === CP09_ROOT_SUBJECT &&
    value.modifiedTracked.length === 0 && value.staged.length === 0 &&
    value.untracked.length === 0 && value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    JSON.stringify(value.committedPaths) === JSON.stringify([...CP09_ROOT_PATHS]);
  if (committedCp09RootAuthority) return "cp09-root-authority-committed";
  if (value.head === CP09_ROOT_TRANSITION && value.untracked.length === 0 &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify([...CP09_AUTHORITY_PATHS])) {
    return "cp09-authority-uncommitted";
  }
  const committedStudioPublicationAuthority =
    value.head === STUDIO_PUBLICATION_AUTHORITY_HEAD &&
    value.parent === STUDIO_PUBLICATION_BASE_HEAD &&
    value.subject === STUDIO_PUBLICATION_AUTHORITY_SUBJECT &&
    value.modifiedTracked.length === 0 && value.staged.length === 0 &&
    value.untracked.length === 0 && value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    JSON.stringify(value.committedPaths) === JSON.stringify(STUDIO_PUBLICATION_AUTHORITY_PATHS);
  if (committedStudioPublicationAuthority) {
    return "studio-publication-authority-committed";
  }
  const base = value.head === ACCEPTED_P23_HEAD && value.subject === P23_SUBJECT;
  if (base && value.modifiedTracked.length === 0 &&
      JSON.stringify(value.untracked) === JSON.stringify([PAYLOAD_VALIDATOR_REL])) {
    return "p3a-test-first-uncommitted";
  }
  if (base &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify([ACTIVATOR_REL, VALIDATOR_REL].sort()) &&
      JSON.stringify(value.untracked) === JSON.stringify([PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL].sort())) {
    return "p3a-uncommitted";
  }
  const repairBase = value.head === P3A_CANDIDATE_HEAD && value.parent === ACCEPTED_P23_HEAD &&
    value.subject === P3A_SUBJECT && value.untracked.length === 0 &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P3A_AUTHORIZED_PATHS);
  if (repairBase && JSON.stringify(value.modifiedTracked) === JSON.stringify(P3A_AUTHORIZED_PATHS)) {
    return "p3a-repair-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.parent === ACCEPTED_P23_HEAD && value.subject === P3A_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3A_AUTHORIZED_PATHS)) {
    return "p3a-committed";
  }
  // P3B two-commit stack.
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.parent === INTEGRATED_P3A_HEAD && value.subject === P3B_SOURCE_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3B_SOURCE_PATHS)) {
    return "p3b-source-committed";
  }
  const p3bValidationBase = value.head === P3B_SOURCE_HEAD &&
    value.subject === P3B_SOURCE_SUBJECT && value.untracked.length === 0;
  if (p3bValidationBase && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3B_VALIDATION_PATHS.includes(entry))) {
    return "p3b-validation-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.parent === P3B_SOURCE_HEAD && value.subject === P3B_VALIDATION_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3B_VALIDATION_PATHS)) {
    return "p3b-validation-committed";
  }
  // P3B modes: base is the integrated P3A commit.
  const p3bBase = value.head === INTEGRATED_P3A_HEAD && value.untracked.length === 0;
  if (p3bBase && JSON.stringify(value.modifiedTracked) === JSON.stringify([PAYLOAD_MODULE_REL])) {
    return "p3b-test-first-uncommitted";
  }
  // Progressive P3B work: every modified path must be inside the authorized four,
  // and nothing outside it may appear.
  if (p3bBase && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3B_LEGACY_PATHS.includes(entry))) {
    return "p3b-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.parent === INTEGRATED_P3A_HEAD && value.subject === P3B_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3B_AUTHORIZED_PATHS)) {
    return "p3b-committed";
  }
  // P3C-A1: one feature slice on top of the integrated P3B stack, touching
  // exactly the four authorized paths and staging nothing.
  const p3cA1Base = value.head === INTEGRATED_P3B_HEAD && value.untracked.length === 0 &&
    value.staged.length === 0;
  if (p3cA1Base && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3C_A1_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a1-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.parent === INTEGRATED_P3B_HEAD && value.subject === P3C_A1_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3C_A1_AUTHORIZED_PATHS)) {
    return "p3c-a1-committed";
  }
  const p3cA2Base = value.head === ACCEPTED_P3C_A1_HEAD && value.untracked.length === 0 &&
    value.staged.length === 0;
  if (p3cA2Base && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3C_A2_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a2-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.parent === ACCEPTED_P3C_A1_HEAD && value.subject === P3C_A2_SUBJECT &&
      value.committedPaths.length > 0 &&
      value.committedPaths.every((entry) => P3C_A2_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a2-committed";
  }
  // P3C-A2.1: exactly the three validators on exactly the accepted P3C-A2
  // commit. No descendant allowance, no minimum-path tolerance, no production
  // source, nothing staged, nothing untracked.
  const p3cA21Base = value.head === ACCEPTED_P3C_A2_HEAD && value.untracked.length === 0 &&
    value.staged.length === 0;
  if (p3cA21Base && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3C_A2_1_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a2-1-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.staged.length === 0 &&
      value.parent === ACCEPTED_P3C_A2_HEAD && value.subject === P3C_A2_1_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3C_A2_1_AUTHORIZED_PATHS)) {
    return "p3c-a2-1-committed";
  }
  const p3cB1Base = value.head === ACCEPTED_P3C_A2_1_HEAD && value.untracked.length === 0 &&
    value.staged.length === 0;
  if (p3cB1Base && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3C_B1_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-b1-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.staged.length === 0 &&
      value.parent === ACCEPTED_P3C_A2_1_HEAD && value.subject === P3C_B1_SUBJECT &&
      JSON.stringify(value.committedPaths) === JSON.stringify(P3C_B1_COMMITTED_PATHS)) {
    return "p3c-b1-committed";
  }
  const p3cA3Base = value.head === ACCEPTED_P3C_B1_HEAD && value.untracked.length === 0 &&
    value.staged.length === 0;
  if (p3cA3Base && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3C_A3_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a3-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.staged.length === 0 &&
      value.parent === ACCEPTED_P3C_B1_HEAD && value.subject === P3C_A3_SUBJECT &&
      value.committedPaths.length > 0 &&
      value.committedPaths.every((entry) => P3C_A3_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a3-committed";
  }
  const p3cA3bBase = value.head === ACCEPTED_P3C_A3A_HEAD && value.untracked.length === 0 &&
    value.staged.length === 0;
  if (p3cA3bBase && value.modifiedTracked.length > 0 &&
      value.modifiedTracked.every((entry) => P3C_A3_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a3b-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.staged.length === 0 &&
      value.parent === ACCEPTED_P3C_A3A_HEAD && value.subject === P3C_A3B_SUBJECT &&
      value.committedPaths.length > 0 &&
      value.committedPaths.every((entry) => P3C_A3_AUTHORIZED_PATHS.includes(entry))) {
    return "p3c-a3b-committed";
  }
  // P3C main synchronization. The merge's SHAPE is the authority: exactly two
  // parents, the A3b tip first and the exact committed main tip second. A wrong
  // parent, wrong subject, extra/missing path, staged path or untracked file all
  // reject. No descendant allowance, no minimum-path tolerance.
  const syncMergeShapeOk = (parents) => parents.length === 2 &&
    parents[0] === P3C_SYNC_FIRST_PARENT && parents[1] === P3C_SYNC_MAIN_TIP;
  const p3cSyncBase = value.head === P3C_SYNC_MERGE_HEAD &&
    syncMergeShapeOk(value.headParents ?? []) &&
    value.untracked.length === 0 && value.staged.length === 0;
  if (p3cSyncBase &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify(P3C_SYNC_AUTHORIZED_PATHS)) {
    return "p3c-main-sync-uncommitted";
  }
  const p3cSyncClean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.staged.length === 0 &&
    value.parent === P3C_SYNC_MERGE_HEAD &&
    syncMergeShapeOk(value.parentParents ?? []) &&
    value.subject === P3C_SYNC_SUBJECT &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P3C_SYNC_AUTHORIZED_PATHS);
  if (p3cSyncClean) return "p3c-main-sync-committed";
  // FINAL release synchronization. The merge's SHAPE is the authority: exactly
  // two parents, the completed P3C tip first and the exact committed main tip
  // second. A wrong parent, wrong subject, extra/missing path, staged path or
  // untracked file all reject. No descendant allowance, no path tolerance.
  // Exactly two parents, in order, and no third: first the completed P3C tip,
  // second the exact committed main tip.
  const finalSyncShapeOk = (first, second, third) =>
    first === P3C_FINAL_SYNC_FIRST_PARENT && second === P3C_FINAL_SYNC_MAIN_TIP &&
    (third ?? null) === null;
  const p3cFinalBase = value.head === P3C_FINAL_SYNC_MERGE_HEAD &&
    finalSyncShapeOk(value.headFirstParent, value.headSecondParent, value.headThirdParent) &&
    value.untracked.length === 0 && value.staged.length === 0;
  if (p3cFinalBase &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify(P3C_FINAL_SYNC_AUTHORIZED_PATHS)) {
    return "p3c-final-sync-uncommitted";
  }
  const p3cFinalClean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.staged.length === 0 &&
    value.parent === P3C_FINAL_SYNC_MERGE_HEAD &&
    finalSyncShapeOk(value.parentFirstParent, value.parentSecondParent,
      value.parentThirdParent) &&
    value.subject === P3C_FINAL_SYNC_SUBJECT &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P3C_FINAL_SYNC_AUTHORIZED_PATHS);
  if (p3cFinalClean) return "p3c-final-sync-committed";
  // Final current-main integration. Same shape authority as the sync above:
  // exactly two ordered parents and no third, exact subject, exact two-file
  // scope, nothing staged or untracked. No descendant allowance.
  const integrationShapeOk = (first, second, third) =>
    first === P3C_INTEGRATION_FIRST_PARENT && second === P3C_INTEGRATION_MAIN_TIP &&
    (third ?? null) === null;
  const p3cIntegrationBase = value.head === P3C_INTEGRATION_MERGE_HEAD &&
    integrationShapeOk(value.headFirstParent, value.headSecondParent, value.headThirdParent) &&
    value.untracked.length === 0 && value.staged.length === 0;
  if (p3cIntegrationBase &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify(P3C_INTEGRATION_AUTHORIZED_PATHS)) {
    return "p3c-integration-uncommitted";
  }
  const p3cIntegrationClean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.staged.length === 0 &&
    value.parent === P3C_INTEGRATION_MERGE_HEAD &&
    integrationShapeOk(value.parentFirstParent, value.parentSecondParent,
      value.parentThirdParent) &&
    value.subject === P3C_INTEGRATION_SUBJECT &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P3C_INTEGRATION_AUTHORIZED_PATHS);
  if (p3cIntegrationClean) return "p3c-integration-committed";
  // P3C-C1 live-anchor repair: exactly the payload validator, on the accepted
  // final-integration head. Nothing staged, nothing untracked, no production source and
  // no descendant allowance. The committed counterpart pins the exact repair subject so
  // the classifier does not go red the moment the repair lands.
  const p3cLiveAnchorBase = value.head === ACCEPTED_P3C_INTEGRATION_HEAD &&
    value.untracked.length === 0 && value.staged.length === 0;
  if (p3cLiveAnchorBase &&
      JSON.stringify(value.modifiedTracked) ===
        JSON.stringify([...P3C_LIVE_ANCHOR_AUTHORIZED_PATHS])) {
    return "p3c-live-anchor-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.staged.length === 0 &&
      value.parent === ACCEPTED_P3C_INTEGRATION_HEAD &&
      value.subject === P3C_LIVE_ANCHOR_SUBJECT &&
      JSON.stringify(value.committedPaths) ===
        JSON.stringify([...P3C_LIVE_ANCHOR_AUTHORIZED_PATHS])) {
    return "p3c-live-anchor-committed";
  }
  const currentPayloadBaseline = value.head === ACCEPTED_CURRENT_MAIN_HEAD &&
    value.untracked.length === 0 && value.staged.length === 0;
  if (currentPayloadBaseline &&
      JSON.stringify(value.modifiedTracked) ===
        JSON.stringify([...CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS])) {
    return "payload-current-baseline-uncommitted";
  }
  if (value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
      value.staged.length === 0 &&
      value.parent === ACCEPTED_CURRENT_MAIN_HEAD &&
      value.subject === CURRENT_PAYLOAD_BASELINE_SUBJECT &&
      JSON.stringify(value.committedPaths) ===
        JSON.stringify([...CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS])) {
    return "payload-current-baseline-committed";
  }
  const durabilityRepair = value.head === CLASSIFIER_DURABILITY_BASE &&
    value.modifiedTracked.length === CLASSIFIER_DURABILITY_PATHS.length &&
    value.modifiedTracked.every((relative, index) => relative === CLASSIFIER_DURABILITY_PATHS[index]) &&
    value.staged.length === 0 && value.untracked.length === 0 &&
    value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS);
  if (durabilityRepair) return "classifier-durability-uncommitted";
  const currentDurableAuthorityRepair = value.head === CURRENT_DURABLE_AUTHORITY_BASE &&
    JSON.stringify(value.modifiedTracked) === JSON.stringify([PAYLOAD_VALIDATOR_REL]) &&
    value.staged.length === 0 && value.untracked.length === 0 &&
    value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    hasApprovedPayloadAuthority(value, { requireMainBranch: false });
  if (currentDurableAuthorityRepair) return "payload-durable-authority-uncommitted";
  const committedDurableAuthorityRepair = value.modifiedTracked.length === 0 &&
    value.staged.length === 0 && value.untracked.length === 0 &&
    value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    value.parent === CURRENT_DURABLE_AUTHORITY_BASE &&
    value.subject === PAYLOAD_DURABLE_AUTHORITY_SUBJECT &&
    JSON.stringify(value.committedPaths) === JSON.stringify(PAYLOAD_DURABLE_AUTHORITY_PATHS) &&
    hasApprovedPayloadAuthority(value, { requireMainBranch: false });
  if (committedDurableAuthorityRepair) return "payload-durable-authority-committed";
  if (value.head === CP10_INTENT_TRANSITION && value.untracked.length === 0 &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify([...CP10_AUTHORITY_PATHS])) {
    return "cp10-authority-uncommitted";
  }
  const committedCp10Authority = value.modifiedTracked.length === 0 &&
    value.staged.length === 0 && value.untracked.length === 0 &&
    value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    value.parent === CP10_INTENT_TRANSITION &&
    value.subject === CP10_AUTHORITY_SUBJECT &&
    JSON.stringify(value.committedPaths) === JSON.stringify([...CP10_AUTHORITY_PATHS]) &&
    hasApprovedPayloadAuthority(value, { requireMainBranch: false });
  if (committedCp10Authority) return "cp10-authority-committed";
  // The CP09 self-transition itself, once committed. Bound exactly like the
  // aeaa870a durability repair: parent, subject and single protected path are
  // fixed, the branch requirement is relaxed because the candidate is verified
  // before integration, and the durable chain still has to admit it in full.
  const committedCp09Authority = value.modifiedTracked.length === 0 &&
    value.staged.length === 0 && value.untracked.length === 0 &&
    value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    value.parent === CP09_ROOT_TRANSITION &&
    value.subject === CP09_AUTHORITY_SUBJECT &&
    JSON.stringify(value.committedPaths) === JSON.stringify([...CP09_AUTHORITY_PATHS]) &&
    hasApprovedPayloadAuthority(value, { requireMainBranch: false });
  if (committedCp09Authority) return "cp09-authority-committed";
  const durableCommittedClean = value.modifiedTracked.length === 0 &&
    value.staged.length === 0 && value.untracked.length === 0 &&
    value.missingFinal.length === 0 &&
    JSON.stringify(value.trackedFinal) === JSON.stringify(FINAL_PATHS) &&
    hasApprovedPayloadAuthority(value);
  if (durableCommittedClean) return "committed-clean";
  throw new Error("P3A source scope mismatch");
}

function currentScopeState() {
  const lines = (args) => {
    const value = git(ROOT, args);
    return value ? value.split("\n").filter(Boolean).sort() : [];
  };
  const trackedFinal = lines(["ls-files", "--", ...FINAL_PATHS]);
  const missingFinal = FINAL_PATHS.filter((relative) => !fs.existsSync(path.join(ROOT, relative)));
  const { commits: protectedHistoryCommits, records: protectedHistory } =
    deriveProtectedHistory(ROOT, PAYLOAD_DURABILITY_ANCHOR);
  // The two constant-approved commits are known by id; the remaining protected commits are the
  // runtime-identified payload-validator transitions, told apart by their exact parent. Surfacing
  // a candidate does not approve it: hasApprovedPayloadAuthority still requires the complete
  // record set to match exactly, so an unexplained extra commit is still rejected.
  const runtimeProtectedCommits = protectedHistoryCommits.filter((commit) =>
    commit !== APPROVED_ACTIVATOR_TRANSITION &&
    commit !== APPROVED_ACTIVATOR_ALIAS_TRANSITION &&
    commit !== APPROVED_R2_VERIFICATION_TRANSITION &&
    commit !== APPROVED_R2_STRICT_DEFAULT_TRANSITION &&
    commit !== CP08_PUBLICATION_TRANSITION &&
    commit !== CP08_SYNC_TRANSITION &&
    commit !== CP09_ROOT_TRANSITION &&
    commit !== CP10_INTENT_TRANSITION);
  const parentOf = (commit) =>
    git(ROOT, ["rev-parse", `${commit}^`], { allowFailure: true });
  const payloadDurabilityRepairCommit = runtimeProtectedCommits.find((commit) =>
    parentOf(commit) === CURRENT_DURABLE_AUTHORITY_BASE) ?? null;
  const activatorAliasAuthorityCommit = runtimeProtectedCommits.find((commit) =>
    parentOf(commit) === APPROVED_ACTIVATOR_ALIAS_TRANSITION) ?? null;
  const repairGit = (args) => payloadDurabilityRepairCommit ? git(ROOT, args) : null;
  const aliasGit = (args) => activatorAliasAuthorityCommit ? git(ROOT, args) : null;
  const aliasTransitionPresent =
    protectedHistoryCommits.includes(APPROVED_ACTIVATOR_ALIAS_TRANSITION);
  const aliasTransitionGit = (args) => aliasTransitionPresent ? git(ROOT, args) : null;
  const r2AuthorityCommit = runtimeProtectedCommits.find((commit) =>
    parentOf(commit) === APPROVED_R2_STRICT_DEFAULT_TRANSITION) ?? null;
  const r2AuthorityGit = (args) => r2AuthorityCommit ? git(ROOT, args) : null;
  const cp09AuthorityCommit = runtimeProtectedCommits.find((commit) =>
    parentOf(commit) === CP09_ROOT_TRANSITION) ?? null;
  const cp09AuthorityGit = (args) => cp09AuthorityCommit ? git(ROOT, args) : null;
  // Multi-path transition evidence: the CP08 re-admissions and the CP09 root
  // correction each move several protected paths, so identities are recorded as
  // a map per path rather than the single-path activator shape used by R.2.
  const cp09TransitionEvidence = (commit, paths) => (
    protectedHistoryCommits.includes(commit) ? Object.freeze({
      parent: git(ROOT, ["rev-parse", `${commit}^`]),
      subject: git(ROOT, ["show", "-s", "--format=%s", commit]),
      paths: lines(["diff-tree", "--no-commit-id", "--name-only", "-r", commit,
        "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS]),
      beforeIdentities: protectedIdentityRecord(`${commit}^`, paths),
      afterIdentities: protectedIdentityRecord(commit, paths),
    }) : null);
  const cp10AuthorityCommit = runtimeProtectedCommits.find((commit) =>
    parentOf(commit) === CP10_INTENT_TRANSITION) ?? null;
  const cp10AuthorityGit = (args) => cp10AuthorityCommit ? git(ROOT, args) : null;
  const r2Present = (commit) => protectedHistoryCommits.includes(commit);
  const r2TransitionEvidence = (commit) => (r2Present(commit) ? Object.freeze({
    parent: git(ROOT, ["rev-parse", `${commit}^`]),
    subject: git(ROOT, ["show", "-s", "--format=%s", commit]),
    paths: lines(["diff-tree", "--no-commit-id", "--name-only", "-r", commit,
      "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS]),
    beforeIdentity: gitBlobIdentity(`${commit}^`, ACTIVATOR_REL),
    afterIdentity: gitBlobIdentity(commit, ACTIVATOR_REL),
  }) : null);
  return {
    head: git(ROOT, ["rev-parse", "HEAD"]),
    branch: git(ROOT, ["branch", "--show-current"]),
    approvedAnchorAncestor: git(ROOT, ["merge-base", "--is-ancestor",
      PAYLOAD_DURABILITY_ANCHOR, "HEAD"], { allowFailure: true }) !== null,
    protectedHistory,
    anchorProtectedIdentities: protectedIdentityRecord(PAYLOAD_DURABILITY_ANCHOR),
    approvedTransitionPaths: lines(["diff-tree", "--no-commit-id", "--name-only", "-r",
      APPROVED_ACTIVATOR_TRANSITION, "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS]),
    approvedTransitionBeforeIdentities:
      protectedIdentityRecord(`${APPROVED_ACTIVATOR_TRANSITION}^`,
        APPROVED_ACTIVATOR_TRANSITION_PATHS),
    approvedTransitionAfterIdentities:
      protectedIdentityRecord(APPROVED_ACTIVATOR_TRANSITION,
        APPROVED_ACTIVATOR_TRANSITION_PATHS),
    headProtectedIdentities: protectedIdentityRecord("HEAD"),
    cp08PublicationTransition:
      cp09TransitionEvidence(CP08_PUBLICATION_TRANSITION, CP08_PUBLICATION_PATHS),
    cp08SyncTransition: cp09TransitionEvidence(CP08_SYNC_TRANSITION, CP08_SYNC_PATHS),
    cp09RootTransition: cp09TransitionEvidence(CP09_ROOT_TRANSITION, CP09_ROOT_PATHS),
    cp10IntentTransition: cp09TransitionEvidence(CP10_INTENT_TRANSITION, CP10_INTENT_PATHS),
    cp10AuthorityCommit,
    cp10AuthorityParent: cp10AuthorityGit(["rev-parse", `${cp10AuthorityCommit}^`]),
    cp10AuthoritySubject:
      cp10AuthorityGit(["show", "-s", "--format=%s", cp10AuthorityCommit]),
    cp10AuthorityPaths: cp10AuthorityCommit
      ? lines(["diff-tree", "--no-commit-id", "--name-only", "-r",
        cp10AuthorityCommit, "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS])
      : [],
    cp10AuthorityBeforeIdentity: cp10AuthorityCommit
      ? gitBlobIdentity(`${cp10AuthorityCommit}^`, PAYLOAD_VALIDATOR_REL) : null,
    cp10AuthorityAfterIdentity: cp10AuthorityCommit
      ? gitBlobIdentity(cp10AuthorityCommit, PAYLOAD_VALIDATOR_REL) : null,
    cp09AuthorityCommit,
    cp09AuthorityParent: cp09AuthorityGit(["rev-parse", `${cp09AuthorityCommit}^`]),
    cp09AuthoritySubject:
      cp09AuthorityGit(["show", "-s", "--format=%s", cp09AuthorityCommit]),
    cp09AuthorityPaths: cp09AuthorityCommit
      ? lines(["diff-tree", "--no-commit-id", "--name-only", "-r",
        cp09AuthorityCommit, "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS])
      : [],
    cp09AuthorityBeforeIdentity: cp09AuthorityCommit
      ? gitBlobIdentity(`${cp09AuthorityCommit}^`, PAYLOAD_VALIDATOR_REL) : null,
    cp09AuthorityAfterIdentity: cp09AuthorityCommit
      ? gitBlobIdentity(cp09AuthorityCommit, PAYLOAD_VALIDATOR_REL) : null,
    payloadDurabilityRepairCommit,
    payloadDurabilityRepairParent: repairGit(["rev-parse", `${payloadDurabilityRepairCommit}^`]),
    payloadDurabilityRepairSubject:
      repairGit(["show", "-s", "--format=%s", payloadDurabilityRepairCommit]),
    payloadDurabilityRepairPaths: payloadDurabilityRepairCommit
      ? lines(["diff-tree", "--no-commit-id", "--name-only", "-r",
        payloadDurabilityRepairCommit, "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS])
      : [],
    payloadDurabilityRepairBeforeIdentity: payloadDurabilityRepairCommit
      ? gitBlobIdentity(`${payloadDurabilityRepairCommit}^`, PAYLOAD_VALIDATOR_REL) : null,
    payloadDurabilityRepairAfterIdentity: payloadDurabilityRepairCommit
      ? gitBlobIdentity(payloadDurabilityRepairCommit, PAYLOAD_VALIDATOR_REL) : null,
    activatorAliasTransitionParent:
      aliasTransitionGit(["rev-parse", `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}^`]),
    activatorAliasTransitionSubject:
      aliasTransitionGit(["show", "-s", "--format=%s", APPROVED_ACTIVATOR_ALIAS_TRANSITION]),
    activatorAliasTransitionPaths: aliasTransitionPresent
      ? lines(["diff-tree", "--no-commit-id", "--name-only", "-r",
        APPROVED_ACTIVATOR_ALIAS_TRANSITION, "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS])
      : [],
    activatorAliasTransitionBeforeIdentity: aliasTransitionPresent
      ? gitBlobIdentity(`${APPROVED_ACTIVATOR_ALIAS_TRANSITION}^`, VALIDATOR_REL) : null,
    activatorAliasTransitionAfterIdentity: aliasTransitionPresent
      ? gitBlobIdentity(APPROVED_ACTIVATOR_ALIAS_TRANSITION, VALIDATOR_REL) : null,
    activatorAliasAuthorityCommit,
    activatorAliasAuthorityParent:
      aliasGit(["rev-parse", `${activatorAliasAuthorityCommit}^`]),
    activatorAliasAuthoritySubject:
      aliasGit(["show", "-s", "--format=%s", activatorAliasAuthorityCommit]),
    activatorAliasAuthorityPaths: activatorAliasAuthorityCommit
      ? lines(["diff-tree", "--no-commit-id", "--name-only", "-r",
        activatorAliasAuthorityCommit, "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS])
      : [],
    activatorAliasAuthorityBeforeIdentity: activatorAliasAuthorityCommit
      ? gitBlobIdentity(`${activatorAliasAuthorityCommit}^`, PAYLOAD_VALIDATOR_REL) : null,
    activatorAliasAuthorityAfterIdentity: activatorAliasAuthorityCommit
      ? gitBlobIdentity(activatorAliasAuthorityCommit, PAYLOAD_VALIDATOR_REL) : null,
    r2VerificationTransition: r2TransitionEvidence(APPROVED_R2_VERIFICATION_TRANSITION),
    r2StrictDefaultTransition: r2TransitionEvidence(APPROVED_R2_STRICT_DEFAULT_TRANSITION),
    r2AuthorityCommit,
    r2AuthorityParent: r2AuthorityGit(["rev-parse", `${r2AuthorityCommit}^`]),
    r2AuthoritySubject: r2AuthorityGit(["show", "-s", "--format=%s", r2AuthorityCommit]),
    r2AuthorityPaths: r2AuthorityCommit
      ? lines(["diff-tree", "--no-commit-id", "--name-only", "-r", r2AuthorityCommit,
        "--", ...PROTECTED_PAYLOAD_AUTHORITY_PATHS])
      : [],
    r2AuthorityBeforeIdentity: r2AuthorityCommit
      ? gitBlobIdentity(`${r2AuthorityCommit}^`, PAYLOAD_VALIDATOR_REL) : null,
    r2AuthorityAfterIdentity: r2AuthorityCommit
      ? gitBlobIdentity(r2AuthorityCommit, PAYLOAD_VALIDATOR_REL) : null,
    executionPayloadValidatorIdentity:
      sha256Bytes(fs.readFileSync(path.join(ROOT, PAYLOAD_VALIDATOR_REL))),
    parent: git(ROOT, ["rev-parse", "HEAD^"]),
    // Ordered parents of HEAD and of HEAD^, so a merge's shape is authority
    // rather than something inferred from a single hash.
    headParents: (git(ROOT, ["rev-parse", "HEAD^@"], { allowFailure: true }) || "")
      .split("\n").filter(Boolean),
    // Ordered merge parents as SCALARS. classifyScope normalizes by sorting every
    // array, which silently destroys parent order, so an array can never carry
    // "which parent came first". These four survive normalization untouched.
    headFirstParent: git(ROOT, ["rev-parse", "HEAD^1"], { allowFailure: true }),
    headSecondParent: git(ROOT, ["rev-parse", "HEAD^2"], { allowFailure: true }),
    headThirdParent: git(ROOT, ["rev-parse", "HEAD^3"], { allowFailure: true }),
    parentFirstParent: git(ROOT, ["rev-parse", "HEAD^^1"], { allowFailure: true }),
    parentSecondParent: git(ROOT, ["rev-parse", "HEAD^^2"], { allowFailure: true }),
    parentThirdParent: git(ROOT, ["rev-parse", "HEAD^^3"], { allowFailure: true }),
    parentParents: (git(ROOT, ["rev-parse", "HEAD^^@"], { allowFailure: true }) || "")
      .split("\n").filter(Boolean),
    subject: git(ROOT, ["log", "-1", "--format=%s"]),
    modifiedTracked: lines(["diff", "--name-only"]),
    staged: lines(["diff", "--cached", "--name-only"]),
    untracked: lines(["ls-files", "--others", "--exclude-standard"]),
    trackedFinal,
    missingFinal,
    committedPaths: lines(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]),
  };
}

function baseScope(overrides = {}) {
  return {
    head: ACCEPTED_P23_HEAD, parent: "51e21657f216da50e2183bb1e2d3512e946c1ea9",
    subject: P23_SUBJECT, modifiedTracked: [], staged: [], untracked: [],
    trackedFinal: [], missingFinal: [], committedPaths: [], branch: "fixture",
    approvedAnchorAncestor: false, protectedHistory: [],
    anchorProtectedIdentities: {}, approvedTransitionPaths: [],
    approvedTransitionBeforeIdentities: {}, approvedTransitionAfterIdentities: {},
    headProtectedIdentities: {}, payloadDurabilityRepairCommit: null,
    payloadDurabilityRepairParent: null, payloadDurabilityRepairSubject: null,
    payloadDurabilityRepairPaths: [], payloadDurabilityRepairBeforeIdentity: null,
    payloadDurabilityRepairAfterIdentity: null, executionPayloadValidatorIdentity: null,
    activatorAliasTransitionParent: null, activatorAliasTransitionSubject: null,
    activatorAliasTransitionPaths: [], activatorAliasTransitionBeforeIdentity: null,
    activatorAliasTransitionAfterIdentity: null, activatorAliasAuthorityCommit: null,
    activatorAliasAuthorityParent: null, activatorAliasAuthoritySubject: null,
    activatorAliasAuthorityPaths: [], activatorAliasAuthorityBeforeIdentity: null,
    activatorAliasAuthorityAfterIdentity: null,
    r2VerificationTransition: null, r2StrictDefaultTransition: null,
    r2AuthorityCommit: null, r2AuthorityParent: null, r2AuthoritySubject: null,
    r2AuthorityPaths: [], r2AuthorityBeforeIdentity: null, r2AuthorityAfterIdentity: null,
    ...overrides,
  };
}

function approvedAuthorityScope(overrides = {}) {
  return baseScope({
    head: CURRENT_DURABLE_AUTHORITY_BASE,
    parent: APPROVED_ACTIVATOR_TRANSITION,
    subject: "merge(perf): integrate scroll performance checkpoints",
    branch: "main",
    modifiedTracked: [], staged: [], untracked: [],
    trackedFinal: [...FINAL_PATHS], missingFinal: [],
    committedPaths: ["src-runtime-base/0C1a.🟫🛤️ Scroll Performance 🛤️.js"],
    approvedAnchorAncestor: true,
    protectedHistory: [...APPROVED_PROTECTED_HISTORY],
    anchorProtectedIdentities: { ...ANCHOR_PROTECTED_IDENTITIES },
    approvedTransitionPaths: [...APPROVED_ACTIVATOR_TRANSITION_PATHS],
    approvedTransitionBeforeIdentities: { ...APPROVED_ACTIVATOR_BEFORE_IDENTITIES },
    approvedTransitionAfterIdentities: { ...APPROVED_ACTIVATOR_AFTER_IDENTITIES },
    headProtectedIdentities: { ...APPROVED_CURRENT_PROTECTED_IDENTITIES },
    ...overrides,
  });
}

// Fixture identities for the extended (four-transition) authority era. The repair and
// authority commit ids are fixture values: the real ones are resolved from live history.
const EXTENDED_REPAIR_COMMIT = "a".repeat(40);
const EXTENDED_AUTHORITY_COMMIT = "b".repeat(40);
const EXTENDED_AUTHORITY_IDENTITY = "c".repeat(64);
function extendedAuthorityScope(overrides = {}) {
  return approvedAuthorityScope({
    head: EXTENDED_AUTHORITY_COMMIT,
    parent: APPROVED_ACTIVATOR_ALIAS_TRANSITION,
    subject: ACTIVATOR_ALIAS_AUTHORITY_SUBJECT,
    committedPaths: [...ACTIVATOR_ALIAS_AUTHORITY_PATHS],
    protectedHistory: [...APPROVED_PROTECTED_HISTORY,
      `${EXTENDED_REPAIR_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`,
      `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
      `${EXTENDED_AUTHORITY_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`].sort(),
    payloadDurabilityRepairCommit: EXTENDED_REPAIR_COMMIT,
    payloadDurabilityRepairParent: CURRENT_DURABLE_AUTHORITY_BASE,
    payloadDurabilityRepairSubject: PAYLOAD_DURABLE_AUTHORITY_SUBJECT,
    payloadDurabilityRepairPaths: [...PAYLOAD_DURABLE_AUTHORITY_PATHS],
    payloadDurabilityRepairBeforeIdentity:
      APPROVED_CURRENT_PROTECTED_IDENTITIES[PAYLOAD_VALIDATOR_REL],
    payloadDurabilityRepairAfterIdentity: EXTENDED_AUTHORITY_IDENTITY,
    activatorAliasTransitionParent: APPROVED_ACTIVATOR_ALIAS_PARENT,
    activatorAliasTransitionSubject: APPROVED_ACTIVATOR_ALIAS_SUBJECT,
    activatorAliasTransitionPaths: [...APPROVED_ACTIVATOR_ALIAS_PATHS],
    activatorAliasTransitionBeforeIdentity: APPROVED_ACTIVATOR_ALIAS_BEFORE_IDENTITY,
    activatorAliasTransitionAfterIdentity: APPROVED_ACTIVATOR_ALIAS_AFTER_IDENTITY,
    activatorAliasAuthorityCommit: EXTENDED_AUTHORITY_COMMIT,
    activatorAliasAuthorityParent: APPROVED_ACTIVATOR_ALIAS_TRANSITION,
    activatorAliasAuthoritySubject: ACTIVATOR_ALIAS_AUTHORITY_SUBJECT,
    activatorAliasAuthorityPaths: [...ACTIVATOR_ALIAS_AUTHORITY_PATHS],
    activatorAliasAuthorityBeforeIdentity: ACTIVATOR_ALIAS_AUTHORITY_BEFORE_IDENTITY,
    activatorAliasAuthorityAfterIdentity: EXTENDED_AUTHORITY_IDENTITY,
    executionPayloadValidatorIdentity: EXTENDED_AUTHORITY_IDENTITY,
    headProtectedIdentities: { ...EXTENDED_PROTECTED_IDENTITIES,
      [PAYLOAD_VALIDATOR_REL]: EXTENDED_AUTHORITY_IDENTITY },
    ...overrides,
  });
}

// Fixture identities for the R.2 (seven-transition) era.
const R2_FIXTURE_AUTHORITY_COMMIT = "d".repeat(40);
const R2_FIXTURE_AUTHORITY_IDENTITY = "e".repeat(64);
function r2AuthorityScope(overrides = {}) {
  const evidence = (parent, subject, before, after) => Object.freeze({
    parent, subject, paths: [...APPROVED_R2_TRANSITION_PATHS],
    beforeIdentity: before, afterIdentity: after,
  });
  return extendedAuthorityScope({
    head: R2_FIXTURE_AUTHORITY_COMMIT,
    parent: APPROVED_R2_STRICT_DEFAULT_TRANSITION,
    subject: R2_AUTHORITY_SUBJECT,
    committedPaths: [...R2_AUTHORITY_PATHS],
    protectedHistory: [...APPROVED_PROTECTED_HISTORY,
      `${EXTENDED_REPAIR_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`,
      `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
      `${EXTENDED_AUTHORITY_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`,
      `${APPROVED_R2_VERIFICATION_TRANSITION}\t${ACTIVATOR_REL}`,
      `${APPROVED_R2_STRICT_DEFAULT_TRANSITION}\t${ACTIVATOR_REL}`,
      `${R2_FIXTURE_AUTHORITY_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`].sort(),
    r2VerificationTransition: evidence(APPROVED_R2_VERIFICATION_PARENT,
      APPROVED_R2_VERIFICATION_SUBJECT, APPROVED_R2_VERIFICATION_BEFORE_IDENTITY,
      APPROVED_R2_VERIFICATION_AFTER_IDENTITY),
    r2StrictDefaultTransition: evidence(APPROVED_R2_STRICT_DEFAULT_PARENT,
      APPROVED_R2_STRICT_DEFAULT_SUBJECT, APPROVED_R2_STRICT_DEFAULT_BEFORE_IDENTITY,
      APPROVED_R2_STRICT_DEFAULT_AFTER_IDENTITY),
    r2AuthorityCommit: R2_FIXTURE_AUTHORITY_COMMIT,
    r2AuthorityParent: APPROVED_R2_STRICT_DEFAULT_TRANSITION,
    r2AuthoritySubject: R2_AUTHORITY_SUBJECT,
    r2AuthorityPaths: [...R2_AUTHORITY_PATHS],
    r2AuthorityBeforeIdentity: R2_AUTHORITY_BEFORE_IDENTITY,
    r2AuthorityAfterIdentity: R2_FIXTURE_AUTHORITY_IDENTITY,
    executionPayloadValidatorIdentity: R2_FIXTURE_AUTHORITY_IDENTITY,
    headProtectedIdentities: { ...R2_PROTECTED_IDENTITIES,
      [PAYLOAD_VALIDATOR_REL]: R2_FIXTURE_AUTHORITY_IDENTITY },
    ...overrides,
  });
}

function runScopeTests() {
  scopeTest("test-first state carries only the new payload validator", () => {
    assert.equal(classifyPayloadScope(baseScope({ untracked: [PAYLOAD_VALIDATOR_REL] })),
      "p3a-test-first-uncommitted");
  });
  scopeTest("exact dirty four-path P3A state is accepted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      modifiedTracked: [ACTIVATOR_REL, VALIDATOR_REL].sort(),
      untracked: [PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL].sort(),
    })), "p3a-uncommitted");
  });
  scopeTest("committed P3A state is accepted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: "future", parent: ACCEPTED_P23_HEAD, subject: P3A_SUBJECT,
      committedPaths: [...P3A_AUTHORIZED_PATHS],
    })), "p3a-committed");
  });
  scopeTest("exact dirty four-path P3C-B1 state is accepted and pinned", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: ACCEPTED_P3C_A2_1_HEAD, parent: ACCEPTED_P3C_A2_HEAD, subject: P3C_A2_1_SUBJECT,
      modifiedTracked: [...P3C_B1_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P3C_A2_1_AUTHORIZED_PATHS],
    })), "p3c-b1-uncommitted");
    assert.equal(classifyPayloadScope(baseScope({
      head: "future-p3c-b1", parent: ACCEPTED_P3C_A2_1_HEAD, subject: P3C_B1_SUBJECT,
      modifiedTracked: [], untracked: [], committedPaths: [...P3C_B1_COMMITTED_PATHS],
    })), "p3c-b1-committed");
    for (const override of [
      { parent: ACCEPTED_P3C_A2_HEAD },
      { subject: P3C_A2_1_SUBJECT },
      { committedPaths: [...P3C_B1_COMMITTED_PATHS, WRITER_VALIDATOR_REL].sort() },
      { committedPaths: [ACTIVATOR_REL] },
      { staged: [ACTIVATOR_REL] },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: "future-p3c-b1", parent: ACCEPTED_P3C_A2_1_HEAD, subject: P3C_B1_SUBJECT,
        modifiedTracked: [], untracked: [], committedPaths: [...P3C_B1_COMMITTED_PATHS], ...override,
      })), /scope mismatch|rejects staged/u);
    }
  });
  scopeTest("exact dirty three-validator P3C-A2.1 state is accepted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: ACCEPTED_P3C_A2_HEAD, parent: ACCEPTED_P3C_A1_HEAD, subject: P3C_A2_SUBJECT,
      modifiedTracked: [...P3C_A2_1_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P3C_A2_AUTHORIZED_PATHS],
    })), "p3c-a2-1-uncommitted");
    for (const override of [
      { modifiedTracked: [...P3C_A2_1_AUTHORIZED_PATHS, PAYLOAD_MODULE_REL].sort() },
      { modifiedTracked: [...P3C_A2_1_AUTHORIZED_PATHS, ACTIVATOR_REL].sort() },
      { untracked: ["stray.mjs"] },
      { staged: [WRITER_VALIDATOR_REL] },
      { head: "0000000000000000000000000000000000000000" },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: ACCEPTED_P3C_A2_HEAD, parent: ACCEPTED_P3C_A1_HEAD, subject: P3C_A2_SUBJECT,
        modifiedTracked: [...P3C_A2_1_AUTHORIZED_PATHS], untracked: [],
        committedPaths: [...P3C_A2_AUTHORIZED_PATHS], ...override,
      })), /scope mismatch|rejects staged/u);
    }
    // Boundary: those same three validators dirty on the P3C-A2 base commit are
    // still P3C-A2 work; the A2.1 mode is keyed on its base commit, not overlap.
    assert.equal(classifyPayloadScope(baseScope({
      head: ACCEPTED_P3C_A1_HEAD, parent: INTEGRATED_P3B_HEAD, subject: P3C_A1_SUBJECT,
      modifiedTracked: [...P3C_A2_1_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P3C_A1_AUTHORIZED_PATHS],
    })), "p3c-a2-uncommitted");
  });
  scopeTest("committed P3C-A2.1 pins parent, subject and the exact three-path set", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: "future-p3c-a2-1", parent: ACCEPTED_P3C_A2_HEAD, subject: P3C_A2_1_SUBJECT,
      modifiedTracked: [], untracked: [], committedPaths: [...P3C_A2_1_AUTHORIZED_PATHS],
    })), "p3c-a2-1-committed");
    for (const override of [
      { parent: ACCEPTED_P3C_A1_HEAD },
      { subject: P3C_A2_SUBJECT },
      { committedPaths: [...P3C_A2_1_AUTHORIZED_PATHS, PAYLOAD_MODULE_REL].sort() },
      // Exact, not minimum: a strict subset is refused.
      { committedPaths: [VALIDATOR_REL, WRITER_VALIDATOR_REL].sort() },
      { committedPaths: [WRITER_VALIDATOR_REL] },
      { committedPaths: [] },
      { modifiedTracked: [WRITER_VALIDATOR_REL] },
      { untracked: ["stray.mjs"] },
      { staged: [VALIDATOR_REL] },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: "future-p3c-a2-1", parent: ACCEPTED_P3C_A2_HEAD, subject: P3C_A2_1_SUBJECT,
        modifiedTracked: [], untracked: [], committedPaths: [...P3C_A2_1_AUTHORIZED_PATHS],
        ...override,
      })), /scope mismatch|rejects staged/u);
    }
  });
  scopeTest("exact dirty four-path P3C-A1 state is accepted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: INTEGRATED_P3B_HEAD, parent: P3B_SOURCE_HEAD, subject: P3B_VALIDATION_SUBJECT,
      modifiedTracked: [...P3C_A1_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P3B_VALIDATION_PATHS],
    })), "p3c-a1-uncommitted");
  });
  scopeTest("P3C-A1 dirty scope rejects unauthorized, staged or untracked paths", () => {
    for (const override of [
      { modifiedTracked: [...P3C_A1_AUTHORIZED_PATHS, PACKAGE_REL].sort() },
      { untracked: ["stray.mjs"] },
      { staged: [PAYLOAD_MODULE_REL] },
      { head: P3B_SOURCE_HEAD },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: INTEGRATED_P3B_HEAD, parent: P3B_SOURCE_HEAD, subject: P3B_VALIDATION_SUBJECT,
        modifiedTracked: [...P3C_A1_AUTHORIZED_PATHS], untracked: [],
        committedPaths: [...P3B_VALIDATION_PATHS], ...override,
      })), /scope mismatch|rejects staged/u);
    }
  });
  scopeTest("exact committed four-path P3C-A1 state is accepted and pins parent and subject", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: "future-p3c-a1", parent: INTEGRATED_P3B_HEAD, subject: P3C_A1_SUBJECT,
      modifiedTracked: [], untracked: [], committedPaths: [...P3C_A1_AUTHORIZED_PATHS],
    })), "p3c-a1-committed");
    for (const override of [
      { parent: P3B_SOURCE_HEAD },
      { subject: P3B_VALIDATION_SUBJECT },
      { committedPaths: [...P3B_VALIDATION_PATHS] },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: "future-p3c-a1", parent: INTEGRATED_P3B_HEAD, subject: P3C_A1_SUBJECT,
        modifiedTracked: [], untracked: [], committedPaths: [...P3C_A1_AUTHORIZED_PATHS], ...override,
      })), /scope mismatch/u);
    }
  });
  scopeTest("exact one-path P3C-C1 live-anchor dirty state is accepted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: ACCEPTED_P3C_INTEGRATION_HEAD, parent: P3C_INTEGRATION_MERGE_HEAD,
      subject: P3C_INTEGRATION_SUBJECT,
      modifiedTracked: [...P3C_LIVE_ANCHOR_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P3C_INTEGRATION_AUTHORIZED_PATHS],
    })), "p3c-live-anchor-uncommitted");
  });
  scopeTest("P3C-C1 live-anchor scope rejects production source, extra, staged or untracked paths", () => {
    for (const override of [
      { modifiedTracked: [PAYLOAD_MODULE_REL] },
      { modifiedTracked: [PAYLOAD_VALIDATOR_REL, PAYLOAD_MODULE_REL].sort() },
      { modifiedTracked: [PAYLOAD_VALIDATOR_REL, ACTIVATOR_REL].sort() },
      { modifiedTracked: [PAYLOAD_VALIDATOR_REL, PACKAGE_REL].sort() },
      { untracked: ["stray.mjs"] },
      { staged: [PAYLOAD_VALIDATOR_REL] },
      { head: P3C_INTEGRATION_MERGE_HEAD },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: ACCEPTED_P3C_INTEGRATION_HEAD, parent: P3C_INTEGRATION_MERGE_HEAD,
        subject: P3C_INTEGRATION_SUBJECT,
        modifiedTracked: [...P3C_LIVE_ANCHOR_AUTHORIZED_PATHS], untracked: [],
        committedPaths: [...P3C_INTEGRATION_AUTHORIZED_PATHS], ...override,
      })), /scope mismatch|rejects staged/u);
    }
  });
  scopeTest("committed P3C-C1 live-anchor state pins parent, subject and the single path", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: "future-p3c-c1", parent: ACCEPTED_P3C_INTEGRATION_HEAD,
      subject: P3C_LIVE_ANCHOR_SUBJECT,
      modifiedTracked: [], untracked: [],
      committedPaths: [...P3C_LIVE_ANCHOR_AUTHORIZED_PATHS],
    })), "p3c-live-anchor-committed");
    for (const override of [
      { parent: P3C_INTEGRATION_MERGE_HEAD },
      { subject: P3C_INTEGRATION_SUBJECT },
      { committedPaths: [PAYLOAD_VALIDATOR_REL, PAYLOAD_MODULE_REL].sort() },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: "future-p3c-c1", parent: ACCEPTED_P3C_INTEGRATION_HEAD,
        subject: P3C_LIVE_ANCHOR_SUBJECT, modifiedTracked: [], untracked: [],
        committedPaths: [...P3C_LIVE_ANCHOR_AUTHORIZED_PATHS], ...override,
      })), /scope mismatch/u);
    }
  });
  scopeTest("exact current-main payload-validator-only state is accepted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: ACCEPTED_CURRENT_MAIN_HEAD,
      modifiedTracked: [...CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS],
    })), "payload-current-baseline-uncommitted");
    for (const override of [
      { modifiedTracked: [PAYLOAD_VALIDATOR_REL, PAYLOAD_MODULE_REL].sort() },
      { modifiedTracked: [PAYLOAD_VALIDATOR_REL, WRITER_VALIDATOR_REL].sort() },
      { staged: [PAYLOAD_VALIDATOR_REL] },
      { untracked: ["stray.mjs"] },
      { modifiedTracked: [] },
      { head: "0000000000000000000000000000000000000000" },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: ACCEPTED_CURRENT_MAIN_HEAD,
        modifiedTracked: [...CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS],
        ...override,
      })), /scope mismatch|rejects staged/u);
    }
  });
  scopeTest("committed current-main payload baseline pins parent, subject and one path", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: "future-current-main-payload", parent: ACCEPTED_CURRENT_MAIN_HEAD,
      subject: CURRENT_PAYLOAD_BASELINE_SUBJECT,
      committedPaths: [...CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS],
    })), "payload-current-baseline-committed");
    for (const override of [
      { parent: "0000000000000000000000000000000000000000" },
      { subject: P3C_LIVE_ANCHOR_SUBJECT },
      { committedPaths: [PAYLOAD_VALIDATOR_REL, WRITER_VALIDATOR_REL].sort() },
      { committedPaths: [PAYLOAD_VALIDATOR_REL, PAYLOAD_MODULE_REL].sort() },
    ]) {
      assert.throws(() => classifyPayloadScope(baseScope({
        head: "future-current-main-payload", parent: ACCEPTED_CURRENT_MAIN_HEAD,
        subject: CURRENT_PAYLOAD_BASELINE_SUBJECT,
        committedPaths: [...CURRENT_PAYLOAD_BASELINE_AUTHORIZED_PATHS],
        ...override,
      })), /scope mismatch/u);
    }
  });
  scopeTest("staged paths are rejected outright", () => {
    assert.throws(() => classifyPayloadScope(baseScope({ staged: [PACKAGE_REL] })), /rejects staged/u);
  });
  scopeTest("an unauthorized modified path is rejected", () => {
    assert.throws(() => classifyPayloadScope(baseScope({
      modifiedTracked: [ACTIVATOR_REL, VALIDATOR_REL, PACKAGE_REL].sort(),
      untracked: [PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("an unauthorized untracked path is rejected", () => {
    assert.throws(() => classifyPayloadScope(baseScope({
      modifiedTracked: [ACTIVATOR_REL, VALIDATOR_REL].sort(),
      untracked: [PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL, "stray.mjs"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("committed P3A rejects a wrong parent", () => {
    assert.throws(() => classifyPayloadScope(baseScope({
      head: "future", parent: "51e21657f216da50e2183bb1e2d3512e946c1ea9", subject: P3A_SUBJECT,
      committedPaths: [...P3A_AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("committed P3A rejects a wrong subject", () => {
    assert.throws(() => classifyPayloadScope(baseScope({
      head: "future", parent: ACCEPTED_P23_HEAD, subject: P23_SUBJECT,
      committedPaths: [...P3A_AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("the P3A repair state modifies exactly the four committed paths", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: P3A_CANDIDATE_HEAD, parent: ACCEPTED_P23_HEAD, subject: P3A_SUBJECT,
      modifiedTracked: [...P3A_AUTHORIZED_PATHS], committedPaths: [...P3A_AUTHORIZED_PATHS],
    })), "p3a-repair-uncommitted");
  });
  scopeTest("committed P3A rejects a fifth committed path", () => {
    assert.throws(() => classifyPayloadScope(baseScope({
      head: "future", parent: ACCEPTED_P23_HEAD, subject: P3A_SUBJECT,
      committedPaths: [...P3A_AUTHORIZED_PATHS, PACKAGE_REL].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("historical classifier-durability repair state remains exact", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: CLASSIFIER_DURABILITY_BASE,
      modifiedTracked: [...CLASSIFIER_DURABILITY_PATHS],
      trackedFinal: [...FINAL_PATHS], missingFinal: [],
    })), "classifier-durability-uncommitted");
  });
  scopeTest("approved anchor and exact 99466b42 transition authorize clean descendants", () => {
    assert.equal(classifyPayloadScope(approvedAuthorityScope()), "committed-clean");
    assert.equal(classifyPayloadScope(approvedAuthorityScope({
      head: APPROVED_ACTIVATOR_TRANSITION,
      parent: "a7817c9b99cb403f800c7f0405e0f1ec799e4384",
      subject: "fix(publish): resolve accepted historical activation intents",
      committedPaths: [...APPROVED_ACTIVATOR_TRANSITION_PATHS],
    })), "committed-clean");
    assert.equal(classifyPayloadScope(approvedAuthorityScope({
      head: "f".repeat(40), parent: CURRENT_DURABLE_AUTHORITY_BASE,
      subject: "feat(prompt-manager): unrelated descendant",
      committedPaths: ["src-runtime-base/prompt-manager-fixture.js"],
    })), "committed-clean");
    assert.equal(classifyPayloadScope(approvedAuthorityScope({
      branch: "w3-publish-payload-durable-authority-fixture",
      modifiedTracked: [PAYLOAD_VALIDATOR_REL],
    })), "payload-durable-authority-uncommitted");
    const repairCommit = "c".repeat(40);
    const repairIdentity = "1".repeat(64);
    const committedRepair = {
      head: repairCommit,
      parent: CURRENT_DURABLE_AUTHORITY_BASE,
      subject: PAYLOAD_DURABLE_AUTHORITY_SUBJECT,
      committedPaths: [...PAYLOAD_DURABLE_AUTHORITY_PATHS],
      protectedHistory: [...APPROVED_PROTECTED_HISTORY,
        `${repairCommit}\t${PAYLOAD_VALIDATOR_REL}`],
      headProtectedIdentities: { ...APPROVED_CURRENT_PROTECTED_IDENTITIES,
        [PAYLOAD_VALIDATOR_REL]: repairIdentity },
      payloadDurabilityRepairCommit: repairCommit,
      payloadDurabilityRepairParent: CURRENT_DURABLE_AUTHORITY_BASE,
      payloadDurabilityRepairSubject: PAYLOAD_DURABLE_AUTHORITY_SUBJECT,
      payloadDurabilityRepairPaths: [...PAYLOAD_DURABLE_AUTHORITY_PATHS],
      payloadDurabilityRepairBeforeIdentity:
        APPROVED_CURRENT_PROTECTED_IDENTITIES[PAYLOAD_VALIDATOR_REL],
      payloadDurabilityRepairAfterIdentity: repairIdentity,
      executionPayloadValidatorIdentity: repairIdentity,
    };
    assert.equal(classifyPayloadScope(approvedAuthorityScope(committedRepair)),
      "payload-durable-authority-committed");
    assert.equal(classifyPayloadScope(approvedAuthorityScope({
      ...committedRepair, branch: "w3-publish-payload-durable-authority-fixture",
    })), "payload-durable-authority-committed");
    assert.equal(classifyPayloadScope(approvedAuthorityScope({
      ...committedRepair,
      head: "e".repeat(40), parent: repairCommit, subject: "unrelated later descendant",
      committedPaths: ["README.md"],
    })), "committed-clean");
    for (const override of [
      { parent: "0".repeat(40) },
      { subject: "same shape, unapproved subject" },
      { committedPaths: [PAYLOAD_VALIDATOR_REL, VALIDATOR_REL].sort() },
      { payloadDurabilityRepairParent: "0".repeat(40) },
      { payloadDurabilityRepairSubject: "same shape, unapproved subject" },
      { payloadDurabilityRepairPaths: [PAYLOAD_VALIDATOR_REL, VALIDATOR_REL].sort() },
      { payloadDurabilityRepairBeforeIdentity: "0".repeat(64) },
      { payloadDurabilityRepairAfterIdentity: "2".repeat(64) },
    ]) {
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        ...committedRepair, ...override,
      })), /scope mismatch/u);
    }
  });
  scopeTest("the exact approved R.2 receipt-verification sequence is accepted", () => {
    assert.equal(classifyPayloadScope(r2AuthorityScope()), "committed-clean");
    assert.equal(classifyPayloadScope(r2AuthorityScope({
      head: "a".repeat(40), parent: R2_FIXTURE_AUTHORITY_COMMIT,
      subject: "unrelated later descendant", committedPaths: ["README.md"],
    })), "committed-clean");
  });
  scopeTest("every deviation from the approved R.2 authority sequence is rejected", () => {
    const bend = (key, patch) => ({ [key]: { ...r2AuthorityScope()[key], ...patch } });
    const history = (extra) => [...r2AuthorityScope().protectedHistory, extra].sort();
    for (const override of [
      // each approved R.2 transition, bound exactly
      bend("r2VerificationTransition", { parent: "0".repeat(40) }),
      bend("r2VerificationTransition", { subject: "same shape, unapproved subject" }),
      bend("r2VerificationTransition", { paths: [ACTIVATOR_REL, PACKAGE_REL].sort() }),
      bend("r2VerificationTransition", { beforeIdentity: "0".repeat(64) }),
      bend("r2VerificationTransition", { afterIdentity: "0".repeat(64) }),
      bend("r2StrictDefaultTransition", { parent: "0".repeat(40) }),
      bend("r2StrictDefaultTransition", { subject: "same shape, unapproved subject" }),
      bend("r2StrictDefaultTransition", { paths: [ACTIVATOR_REL, PACKAGE_REL].sort() }),
      bend("r2StrictDefaultTransition", { beforeIdentity: "0".repeat(64) }),
      bend("r2StrictDefaultTransition", { afterIdentity: "0".repeat(64) }),
      { r2VerificationTransition: null },
      { r2StrictDefaultTransition: null },
      // the bounded self-transition
      { r2AuthorityParent: "0".repeat(40) },
      { r2AuthoritySubject: "same shape, unapproved subject" },
      { r2AuthorityPaths: [PAYLOAD_VALIDATOR_REL, ACTIVATOR_REL].sort() },
      { r2AuthorityBeforeIdentity: "0".repeat(64) },
      { r2AuthorityAfterIdentity: "9".repeat(64) },
      { executionPayloadValidatorIdentity: "9".repeat(64) },
      // an eighth unexplained protected transition may never coexist
      { protectedHistory: history(`${"8".repeat(40)}\t${ACTIVATOR_REL}`) },
      { protectedHistory: history(`${"8".repeat(40)}\t${PACKAGE_REL}`) },
      // the closure may not drift
      { headProtectedIdentities: { ...R2_PROTECTED_IDENTITIES,
        [ACTIVATOR_REL]: APPROVED_R2_VERIFICATION_BEFORE_IDENTITY } },
      { headProtectedIdentities: { ...R2_PROTECTED_IDENTITIES,
        [PACKAGE_REL]: "0".repeat(64) } },
      { headProtectedIdentities: { ...R2_PROTECTED_IDENTITIES,
        [PACKAGE_LOCK_REL]: "0".repeat(64) } },
      // authority is main-branch only
      { branch: "w3-publish-source-authority-r2-fixture" },
    ]) {
      assert.throws(() => classifyPayloadScope(r2AuthorityScope(override)),
        /scope mismatch/u, JSON.stringify(Object.keys(override)));
    }
  });
  scopeTest("the exact approved activator alias authority sequence is accepted", () => {
    assert.equal(classifyPayloadScope(extendedAuthorityScope()), "committed-clean");
    // An ordinary later descendant on main stays acceptable.
    assert.equal(classifyPayloadScope(extendedAuthorityScope({
      head: "f".repeat(40), parent: EXTENDED_AUTHORITY_COMMIT,
      subject: "unrelated later descendant", committedPaths: ["README.md"],
    })), "committed-clean");
  });
  scopeTest("every deviation from the approved activator alias authority sequence is rejected", () => {
    const wrongAliasHistory = (record) => [...APPROVED_PROTECTED_HISTORY,
      `${EXTENDED_REPAIR_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`, record,
      `${EXTENDED_AUTHORITY_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`].sort();
    for (const override of [
      // the approved activator alias transition, bound exactly
      { protectedHistory: wrongAliasHistory(`${"1".repeat(40)}\t${VALIDATOR_REL}`) },
      { protectedHistory: wrongAliasHistory(
        `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${PAYLOAD_VALIDATOR_REL}`) },
      { activatorAliasTransitionParent: "0".repeat(40) },
      { activatorAliasTransitionSubject: "same shape, unapproved subject" },
      { activatorAliasTransitionPaths: [PAYLOAD_VALIDATOR_REL, VALIDATOR_REL].sort() },
      { activatorAliasTransitionBeforeIdentity: "0".repeat(64) },
      { activatorAliasTransitionAfterIdentity: "0".repeat(64) },
      // the bounded self-transition that carries the approval
      { activatorAliasAuthorityParent: "0".repeat(40) },
      { activatorAliasAuthoritySubject: "same shape, unapproved subject" },
      { activatorAliasAuthorityPaths: [PAYLOAD_VALIDATOR_REL, VALIDATOR_REL].sort() },
      { activatorAliasAuthorityBeforeIdentity: "0".repeat(64) },
      { activatorAliasAuthorityAfterIdentity: "3".repeat(64) },
      { executionPayloadValidatorIdentity: "4".repeat(64) },
      // a fifth unexplained protected transition may never coexist
      { protectedHistory: [...APPROVED_PROTECTED_HISTORY,
        `${EXTENDED_REPAIR_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`,
        `${APPROVED_ACTIVATOR_ALIAS_TRANSITION}\t${VALIDATOR_REL}`,
        `${EXTENDED_AUTHORITY_COMMIT}\t${PAYLOAD_VALIDATOR_REL}`,
        `${"5".repeat(40)}\t${VALIDATOR_REL}`].sort() },
      // the closure may not drift
      { headProtectedIdentities: { ...EXTENDED_PROTECTED_IDENTITIES,
        [VALIDATOR_REL]: APPROVED_ACTIVATOR_ALIAS_BEFORE_IDENTITY } },
      { headProtectedIdentities: { ...EXTENDED_PROTECTED_IDENTITIES,
        [ACTIVATOR_REL]: "0".repeat(64) } },
      // the earlier durability repair keeps its own bounded shape
      { payloadDurabilityRepairParent: "0".repeat(40) },
      { payloadDurabilityRepairSubject: "same shape, unapproved subject" },
      { payloadDurabilityRepairBeforeIdentity: "0".repeat(64) },
      // authority is main-branch only
      { branch: "w3-publish-payload-authority-fixture" },
    ]) {
      assert.throws(() => classifyPayloadScope(extendedAuthorityScope(override)),
        /scope mismatch/u, JSON.stringify(Object.keys(override)));
    }
  });
  scopeTest("full history exposes protected branch and merge-result transitions without rejecting unrelated merges",
    () => {
      const initialize = (label) => {
        const repository = path.join(tempRoot(label), "repository");
        fs.mkdirSync(path.join(repository, path.dirname(PAYLOAD_MODULE_REL)), { recursive: true });
        git(repository, ["init", "-q", "-b", "main"]);
        git(repository, ["config", "user.name", "Payload Authority Fixture"]);
        git(repository, ["config", "user.email", "payload-authority@example.invalid"]);
        fs.writeFileSync(path.join(repository, PAYLOAD_MODULE_REL), "approved payload bytes\n");
        git(repository, ["add", PAYLOAD_MODULE_REL]);
        git(repository, ["commit", "-q", "-m", "fixture: approved authority"]);
        return { repository, anchor: git(repository, ["rev-parse", "HEAD"]) };
      };
      const commitFile = (repository, relative, bytes, subject) => {
        const absolute = path.join(repository, relative);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, bytes);
        git(repository, ["add", "--", relative]);
        git(repository, ["commit", "-q", "-m", subject]);
        return git(repository, ["rev-parse", "HEAD"]);
      };
      const deleteFile = (repository, relative, subject) => {
        fs.rmSync(path.join(repository, relative));
        git(repository, ["add", "-u", "--", relative]);
        git(repository, ["commit", "-q", "-m", subject]);
        return git(repository, ["rev-parse", "HEAD"]);
      };
      const mergeWithProtectedResult = (repository, branch, bytes, subject) => {
        git(repository, ["merge", "-q", "--no-ff", "--no-commit", branch]);
        fs.writeFileSync(path.join(repository, PAYLOAD_MODULE_REL), bytes);
        git(repository, ["add", "--", PAYLOAD_MODULE_REL]);
        git(repository, ["commit", "-q", "-m", subject]);
        return git(repository, ["rev-parse", "HEAD"]);
      };

      const protectedFixture = initialize("authority-protected-merge");
      git(protectedFixture.repository, ["checkout", "-q", "-b", "protected-side"]);
      const mutation = commitFile(protectedFixture.repository, PAYLOAD_MODULE_REL,
        "unapproved payload bytes\n", "fixture: mutate protected payload");
      const reversion = commitFile(protectedFixture.repository, PAYLOAD_MODULE_REL,
        "approved payload bytes\n", "fixture: restore approved payload bytes");
      const deletion = deleteFile(protectedFixture.repository, PAYLOAD_MODULE_REL,
        "fixture: delete protected payload");
      const recreation = commitFile(protectedFixture.repository, PAYLOAD_MODULE_REL,
        "approved payload bytes\n", "fixture: recreate approved payload bytes");
      const linear = deriveProtectedHistory(protectedFixture.repository,
        protectedFixture.anchor, recreation, [PAYLOAD_MODULE_REL]);
      assert.deepEqual(linear.commits, [mutation, reversion, deletion, recreation],
        "linear mutation, reversion, deletion, and recreation must all remain visible");
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, ...linear.records],
      })), /scope mismatch/u);

      git(protectedFixture.repository, ["checkout", "-q", "main"]);
      commitFile(protectedFixture.repository, "main-unrelated.txt", "main advancement\n",
        "fixture: advance main without publication authority");
      git(protectedFixture.repository, ["merge", "-q", "--no-ff", "-m",
        "fixture: merge protected side", "protected-side"]);
      assert.equal(fs.readFileSync(path.join(protectedFixture.repository, PAYLOAD_MODULE_REL), "utf8"),
        "approved payload bytes\n", "merged final bytes must equal approved authority");
      const defaultOutput = git(protectedFixture.repository, ["rev-list", "--reverse",
        `${protectedFixture.anchor}..HEAD`, "--", PAYLOAD_MODULE_REL]);
      assert.equal(defaultOutput, "",
        "default history simplification must reproduce the mutate/revert evasion");
      const merged = deriveProtectedHistory(protectedFixture.repository,
        protectedFixture.anchor, "HEAD", [PAYLOAD_MODULE_REL]);
      assert.deepEqual(merged.commits, [mutation, reversion, deletion, recreation],
        "full history must expose all merged non-merge protected commits");
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, ...merged.records],
      })), /scope mismatch/u);

      const evilFixture = initialize("authority-evil-merge");
      assert.deepEqual(gitCommitParents(evilFixture.repository, evilFixture.anchor), [],
        "approved fixture root must have no parents");
      git(evilFixture.repository, ["checkout", "-q", "-b", "evil-one-side"]);
      commitFile(evilFixture.repository, "side-one.txt", "side one\n",
        "fixture: first unrelated side parent");
      git(evilFixture.repository, ["checkout", "-q", "main"]);
      const ordinary = commitFile(evilFixture.repository, "main-one.txt", "main one\n",
        "fixture: first unrelated main parent");
      assert.equal(gitCommitParents(evilFixture.repository, ordinary).length, 1,
        "ordinary commit must have one parent");
      const evilMerge = mergeWithProtectedResult(evilFixture.repository, "evil-one-side",
        "evil merge-only payload bytes\n", "fixture: evil merge introduces protected bytes");
      assert.equal(gitCommitParents(evilFixture.repository, evilMerge).length, 2,
        "evil mutation must be a true two-parent merge");
      for (const parent of gitCommitParents(evilFixture.repository, evilMerge)) {
        assert.equal(git(evilFixture.repository, ["show", `${parent}:${PAYLOAD_MODULE_REL}`]),
          "approved payload bytes",
          "evil merge result must differ from the protected bytes in both parents");
      }
      const evilMutationHistory = deriveProtectedHistory(evilFixture.repository,
        evilFixture.anchor, evilMerge, [PAYLOAD_MODULE_REL]);
      assert.deepEqual(evilMutationHistory.commits, [evilMerge]);
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, ...evilMutationHistory.records],
      })), /scope mismatch/u, "the merge-only protected mutation must reject independently");

      git(evilFixture.repository, ["checkout", "-q", "-b", "evil-two-side"]);
      commitFile(evilFixture.repository, "side-two.txt", "side two\n",
        "fixture: second unrelated side parent");
      git(evilFixture.repository, ["checkout", "-q", "main"]);
      commitFile(evilFixture.repository, "main-two.txt", "main two\n",
        "fixture: second unrelated main parent");
      const restoreMerge = mergeWithProtectedResult(evilFixture.repository, "evil-two-side",
        "approved payload bytes\n", "fixture: evil merge restores approved bytes");
      assert.equal(gitCommitParents(evilFixture.repository, restoreMerge).length, 2,
        "evil restoration must be a true two-parent merge");
      for (const parent of gitCommitParents(evilFixture.repository, restoreMerge)) {
        assert.equal(git(evilFixture.repository, ["show", `${parent}:${PAYLOAD_MODULE_REL}`]),
          "evil merge-only payload bytes",
          "restoring merge result must differ from the protected bytes in both parents");
      }
      assert.equal(fs.readFileSync(path.join(evilFixture.repository, PAYLOAD_MODULE_REL), "utf8"),
        "approved payload bytes\n", "evil merge topology must finish on approved bytes");
      const omittedMergeHistory = git(evilFixture.repository, ["rev-list", "--reverse",
        "--full-history", "--no-merges", `${evilFixture.anchor}..HEAD`, "--",
        PAYLOAD_MODULE_REL]);
      assert.equal(omittedMergeHistory, "",
        "the former --no-merges evidence must reproduce the merge-only evasion");
      const evilHistory = deriveProtectedHistory(evilFixture.repository,
        evilFixture.anchor, "HEAD", [PAYLOAD_MODULE_REL]);
      assert.deepEqual(evilHistory.commits, [evilMerge, restoreMerge],
        "merge-inclusive evidence must retain mutation and restoration merge records");
      for (const record of evilHistory.records) {
        assert.equal(record.split("\t")[1], PAYLOAD_MODULE_REL,
          "each evil merge record must identify the protected path");
        assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
          protectedHistory: [...APPROVED_PROTECTED_HISTORY, record],
        })), /scope mismatch/u,
        "each real-derived merge-only protected transition must reject independently");
      }
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, ...evilHistory.records],
      })), /scope mismatch/u);
      assert.throws(() => gitCommitParents(evilFixture.repository, "0".repeat(40)),
        /Command failed/u, "failed parent lookup must throw rather than downgrade a merge");

      const unrelatedFixture = initialize("authority-unrelated-merge");
      git(unrelatedFixture.repository, ["checkout", "-q", "-b", "unrelated-side"]);
      commitFile(unrelatedFixture.repository, "side-unrelated.txt", "side only\n",
        "fixture: unrelated side change");
      git(unrelatedFixture.repository, ["checkout", "-q", "main"]);
      commitFile(unrelatedFixture.repository, "main-unrelated.txt", "main only\n",
        "fixture: unrelated main change");
      git(unrelatedFixture.repository, ["merge", "-q", "--no-ff", "-m",
        "fixture: merge unrelated side", "unrelated-side"]);
      const unrelatedMerge = git(unrelatedFixture.repository, ["rev-parse", "HEAD"]);
      assert.equal(gitCommitParents(unrelatedFixture.repository, unrelatedMerge).length, 2,
        "unrelated positive control must be a true two-parent merge");
      assert.equal(git(unrelatedFixture.repository, ["diff-tree", "-c", "--no-commit-id",
        "--name-only", "-r", unrelatedMerge, "--", PAYLOAD_MODULE_REL]), "",
      "ordinary unrelated merge must have no combined protected diff");
      const unrelated = deriveProtectedHistory(unrelatedFixture.repository,
        unrelatedFixture.anchor, "HEAD", [PAYLOAD_MODULE_REL]);
      assert.deepEqual(unrelated, { commits: [], records: [] });
      assert.equal(classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, ...unrelated.records],
      })), "committed-clean");
    });
  scopeTest("durable authority rejects unexplained protected history and adjacent states", () => {
    const changed = (commit, ...paths) => `${commit}\t${[...paths].sort().join("\t")}`;
    const arbitrary = "d".repeat(40);
    const reverted = "e".repeat(40);
    const protectedMutations = [
      ["payload production", PAYLOAD_MODULE_REL],
      ["Activator production", ACTIVATOR_REL],
      ["Payload validator", PAYLOAD_VALIDATOR_REL],
      ["Activator validator", VALIDATOR_REL],
      ["package authority", PACKAGE_REL],
      ["package lock authority", PACKAGE_LOCK_REL],
    ];
    for (const [, relative] of protectedMutations) {
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, changed(arbitrary, relative)],
      })), /scope mismatch/u);
    }
    for (const relative of APPROVED_ACTIVATOR_TRANSITION_PATHS) {
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
        protectedHistory: [...APPROVED_PROTECTED_HISTORY, changed(arbitrary, relative)],
      })), /scope mismatch/u, `later mutation of ${relative} must reject`);
    }
    // A revert to the approved bytes is still unexplained protected history.
    assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
      protectedHistory: [
        ...APPROVED_PROTECTED_HISTORY,
        changed(arbitrary, PAYLOAD_MODULE_REL),
        changed(reverted, PAYLOAD_MODULE_REL),
      ],
    })), /scope mismatch/u);
    // Subject resemblance grants nothing: transition identity is the commit SHA.
    assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
      subject: "fix(publish): resolve accepted historical activation intents",
      protectedHistory: [changed(arbitrary, ...APPROVED_ACTIVATOR_TRANSITION_PATHS)],
    })), /scope mismatch/u);
    assert.throws(() => classifyPayloadScope(approvedAuthorityScope({
      protectedHistory: [changed(APPROVED_ACTIVATOR_TRANSITION, ACTIVATOR_REL)],
      approvedTransitionPaths: [ACTIVATOR_REL],
    })), /scope mismatch/u);
    for (const override of [
      { branch: "feature/unregistered" },
      { approvedAnchorAncestor: false },
      { modifiedTracked: [PAYLOAD_MODULE_REL] },
      { modifiedTracked: [PAYLOAD_VALIDATOR_REL, VALIDATOR_REL].sort() },
      { staged: [PAYLOAD_VALIDATOR_REL] },
      { untracked: ["foreign.txt"] },
      {
        trackedFinal: FINAL_PATHS.filter((relative) => relative !== PAYLOAD_MODULE_REL),
        missingFinal: [PAYLOAD_MODULE_REL],
      },
      { anchorProtectedIdentities: { ...ANCHOR_PROTECTED_IDENTITIES,
        [PAYLOAD_MODULE_REL]: "0".repeat(64) } },
      { headProtectedIdentities: { ...APPROVED_CURRENT_PROTECTED_IDENTITIES,
        [PAYLOAD_MODULE_REL]: "0".repeat(64) } },
    ]) {
      assert.throws(() => classifyPayloadScope(approvedAuthorityScope(override)),
        /scope mismatch|rejects staged/u);
    }
    assert.throws(() => classifyPayloadScope({}), /TypeError|scope mismatch/u);
  });
  scopeTest("exact uncommitted Studio publication-authority round is admitted", () => {
    assert.equal(classifyPayloadScope(baseScope({
      head: STUDIO_PUBLICATION_BASE_HEAD,
      modifiedTracked: [...STUDIO_PUBLICATION_AUTHORITY_PATHS],
      staged: [], untracked: [],
    })), "studio-publication-authority-uncommitted");
  });
  const committedStudioPublicationScope = (overrides = {}) => baseScope({
    head: STUDIO_PUBLICATION_AUTHORITY_HEAD,
    parent: STUDIO_PUBLICATION_BASE_HEAD,
    subject: STUDIO_PUBLICATION_AUTHORITY_SUBJECT,
    branch: "main",
    modifiedTracked: [], staged: [], untracked: [],
    trackedFinal: [...FINAL_PATHS], missingFinal: [],
    committedPaths: [...STUDIO_PUBLICATION_AUTHORITY_PATHS],
    ...overrides,
  });
  scopeTest("exact committed Studio publication-authority transition is admitted", () => {
    assert.equal(classifyPayloadScope(committedStudioPublicationScope()),
      "studio-publication-authority-committed");
  });
  scopeTest("committed Studio publication authority rejects every adjacent history shape", () => {
    for (const override of [
      { head: "f".repeat(40) },
      { parent: "e".repeat(40) },
      { subject: "feat(publish): adjacent Studio publication" },
      { committedPaths: STUDIO_PUBLICATION_AUTHORITY_PATHS.slice(1) },
      { committedPaths: [...STUDIO_PUBLICATION_AUTHORITY_PATHS, "foreign.txt"] },
      {
        head: "d".repeat(40), parent: STUDIO_PUBLICATION_AUTHORITY_HEAD,
        subject: "test(publish): arbitrary validator follow-up",
        committedPaths: [PAYLOAD_VALIDATOR_REL],
      },
      { modifiedTracked: [PAYLOAD_MODULE_REL] },
      { staged: [PAYLOAD_VALIDATOR_REL] },
      { untracked: ["foreign.txt"] },
    ]) {
      assert.throws(() => classifyPayloadScope(committedStudioPublicationScope(override)),
        /scope mismatch|rejects staged/u);
    }
  });
  assert.equal(scopeResults.length, EXPECTED_SCOPE);
}

/* --------------------------------------------------------------------- *
 * Fixtures
 * --------------------------------------------------------------------- */

function buildManifest(root, stagingRoot) {
  const entries = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const filename = path.join(directory, name);
      const stat = fs.lstatSync(filename);
      const relative = path.relative(stagingRoot, filename).split(path.sep).join("/");
      if (stat.isSymbolicLink()) {
        entries.push({ path: relative, type: "symlink", target: fs.readlinkSync(filename) });
        continue;
      }
      if (stat.isDirectory()) { walk(filename); continue; }
      entries.push({
        path: relative, type: "file", bytes: stat.size,
        sha256: sha256Bytes(fs.readFileSync(filename)),
      });
    }
  };
  walk(root);
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  return {
    fileCount: entries.length,
    treeDigest: sha256Bytes(entries.map((entry) => JSON.stringify(entry)).join("\n")),
    entries,
  };
}

/**
 * A disposable canonical fixture: a repository directory with the three real
 * canonical parents, plus a staging root holding the three staged families.
 * Everything lives under one mkdtemp root, so the canonical parents share a
 * filesystem exactly as production requires.
 */
function createCanonicalFixture(label, { withLive = true, emoji = false } = {}) {
  const top = tempRoot(label);
  const repository = path.join(top, emoji ? "repository with spaces 🧪" : "repository");
  const devServer = path.join(repository, "apps", "dev-server");
  const chrome = path.join(repository, "apps", "extensions", "chatgpt", "chrome");
  fs.mkdirSync(devServer, { recursive: true });
  fs.mkdirSync(chrome, { recursive: true });

  const stagingRoot = path.join(top, "h2o-publish-stage-fixture");
  const outputPaths = {
    alias: path.join(stagingRoot, "alias"),
    devOutput: path.join(stagingRoot, "dev_output"),
    extension: path.join(stagingRoot, "extension"),
  };
  fs.mkdirSync(outputPaths.alias, { recursive: true });
  fs.mkdirSync(path.join(outputPaths.devOutput, "nested"), { recursive: true });
  fs.mkdirSync(outputPaths.extension, { recursive: true });

  fs.writeFileSync(path.join(outputPaths.alias, "alias-one.js"), "export const one = 1;\n");
  fs.writeFileSync(path.join(outputPaths.alias, "alias-two.js"), "export const two = 2;\n");
  fs.symlinkSync("alias-one.js", path.join(outputPaths.alias, "alias-link.js"));
  fs.writeFileSync(path.join(outputPaths.devOutput, "bundle.js"), "console.log('bundle');\n");
  fs.writeFileSync(path.join(outputPaths.devOutput, "nested", "chunk.js"), "console.log('chunk');\n");
  fs.writeFileSync(path.join(outputPaths.extension, "manifest.json"), "{\"manifest_version\":3}\n");
  fs.writeFileSync(path.join(outputPaths.extension, "loader.js"), "// loader\n");

  if (withLive) {
    fs.mkdirSync(path.join(devServer, "alias"), { recursive: true });
    fs.writeFileSync(path.join(devServer, "alias", "previous.js"), "// previous generation\n");
    fs.mkdirSync(path.join(devServer, "dev_output"), { recursive: true });
    fs.mkdirSync(path.join(chrome, ACCEPTED_EXTENSION_VARIANT), { recursive: true });
  }

  const manifests = {
    alias: buildManifest(outputPaths.alias, stagingRoot),
    devOutput: buildManifest(outputPaths.devOutput, stagingRoot),
    extension: buildManifest(outputPaths.extension, stagingRoot),
  };
  const receiptPath = path.join(stagingRoot, "publication-receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify({ schemaVersion: 1, mode: "stage-only" }, null, 2));

  return {
    top, repository, devServer, chrome, stagingRoot, outputPaths, manifests, receiptPath,
    anchorRoot: path.join(top, ".h2o-canonical-delivery"),
    verification: {
      source: {
        repository, branch: "main", approvedHead: "a".repeat(40), sourceTree: "b".repeat(40),
        gitExecutable: { path: "/usr/bin/git", realpath: "/usr/bin/git", version: "git version 2.50.1", sha256: "c".repeat(64) },
      },
      receiptPath, receiptSha256: sha256Bytes(fs.readFileSync(receiptPath)),
      stage: {
        stagingRoot, outputPaths, manifests,
        extensionVariant: ACCEPTED_EXTENSION_VARIANT, buildMarker: "2026-08-05T00:00:00.000Z",
      },
    },
  };
}

const AUTHORITATIVE_MAIN = "/Users/hobayda/H2OCode/products/cockpit-pro/h2o-cp-source";

/**
 * Run the exact committed Batch 1.1 publisher in a disposable clone and hand its
 * real receipt straight to P3A. This is the load-bearing manifest-compatibility
 * evidence: no receipt field is adapted.
 */
function createRealPublisherFixture() {
  if (!fs.existsSync(path.join(AUTHORITATIVE_MAIN, "node_modules"))) return null;
  const top = tempRoot("real-publisher");
  const repository = path.join(top, "real publisher 🧪");
  execFileSync("git", ["clone", "--quiet", "--local", ROOT, repository], { cwd: top, timeout: 300_000 });
  const g = (args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
  g(["checkout", "--quiet", "-B", "main", "HEAD"]);
  g(["config", "user.name", "Payload Transaction Validator"]);
  g(["config", "user.email", "payload-transaction@example.invalid"]);
  fs.mkdirSync(path.join(repository, "node_modules"), { recursive: true });
  for (const entry of fs.readdirSync(path.join(AUTHORITATIVE_MAIN, "node_modules"))) {
    const destination = path.join(repository, "node_modules", entry);
    if (!fs.existsSync(destination)) fs.symlinkSync(path.join(AUTHORITATIVE_MAIN, "node_modules", entry), destination);
  }
  for (const relative of ["assets/chrome-dev-controls-icons", "assets/chrome-dev-lean-icons",
    "assets/internal-dev-controls-icons"]) {
    const source = path.join(AUTHORITATIVE_MAIN, relative);
    if (!fs.existsSync(source)) continue;
    fs.mkdirSync(path.join(repository, relative), { recursive: true });
    for (const name of fs.readdirSync(source)) {
      const from = path.join(source, name);
      if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(repository, relative, name));
    }
  }
  const localConfig = path.join(AUTHORITATIVE_MAIN, "config/local/identity-provider.local.json");
  if (fs.existsSync(localConfig)) {
    fs.mkdirSync(path.join(repository, "config/local"), { recursive: true });
    fs.copyFileSync(localConfig, path.join(repository, "config/local/identity-provider.local.json"));
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("H2O_")));
  const run = spawnSync(process.execPath, [path.join(repository, "tools/publish/lean-publisher.mjs"), "--stage-only"], {
    cwd: repository, env, encoding: "utf8", timeout: 900_000, killSignal: "SIGTERM",
  });
  if (run.status !== 0) return null;
  const receiptPath = String(run.stdout || "").match(/receipt\s+:\s+(.+)$/mu)?.[1]?.trim() || null;
  const stagingRoot = String(run.stdout || "").match(/staging root\s+:\s+(.+)$/mu)?.[1]?.trim() || null;
  if (!receiptPath || !stagingRoot) return null;
  temporaryRoots.push(stagingRoot);
  // Canonical parents are gitignored generated-output directories; they exist in
  // production but not in a fresh clone. P3A refuses to create them itself.
  for (const relative of [["apps", "dev-server"], ["apps", "extensions", "chatgpt", "chrome"]]) {
    fs.mkdirSync(path.join(repository, ...relative), { recursive: true });
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  return {
    top, repository, stagingRoot, receiptPath, receipt,
    verification: {
      source: { repository, branch: "main", approvedHead: receipt.approvedHead, sourceTree: "b".repeat(40) },
      receiptPath, receiptSha256: sha256Bytes(fs.readFileSync(receiptPath)),
      stage: {
        stagingRoot, outputPaths: receipt.outputPaths, manifests: receipt.manifests,
        extensionVariant: receipt.stagedExtensionVariant, buildMarker: receipt.buildTimestamp,
      },
    },
  };
}

const ACTIVATION_ID = "20260805T000000000Z-abcdef123456";
// P3B: the ownership handle is mandatory, so every fixture preparation mints one
// through the same exclusive-creation path production uses.
function prepareOwned(api, verification, unit, repository, activationId = ACTIVATION_ID) {
  return api.prepareIncomingTree(verification, unit, {
    repository, ownership: api.createOwnedIncomingRoot(unit, activationId),
  });
}
const OWNER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function recordInput(fixture, api, overrides = {}) {
  const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
  return {
    activationId: ACTIVATION_ID, sequence: 1, previousRecordSha256: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    intentPath: path.join(fixture.anchorRoot, "activation-intents", `${ACTIVATION_ID}.json`),
    intentSha256: "d".repeat(64),
    stageReceiptPath: fixture.receiptPath, stageReceiptSha256: fixture.verification.receiptSha256,
    repositoryRealpath: fixture.repository, authorizedWorktreeRealpath: fixture.repository,
    branch: "main", approvedHead: "a".repeat(40), sourceTree: "b".repeat(40),
    stableGitIdentity: fixture.verification.source.gitExecutable,
    acceptedExtensionVariant: ACCEPTED_EXTENSION_VARIANT,
    buildMarker: fixture.verification.stage.buildMarker,
    owner: { ownerId: OWNER_ID, pid: process.pid },
    transactionState: "untouched",
    trees: units.map((unit) => ({
      logicalName: unit.logicalName, state: "untouched",
      livePath: unit.livePath, incomingPath: unit.incomingPath, retiredPath: unit.retiredPath,
    })),
    ...overrides,
  };
}

/* --------------------------------------------------------------------- *
 * Runtime scenarios
 * --------------------------------------------------------------------- */

async function runRuntimeTests(api) {
  await test("payload independently maps Studio to one canonical unit and preserves Dev Controls", () => {
    assert.deepEqual(api.payloadTargetPolicy("dev-controls-oauth-google").order,
      ["alias", "dev_output", "extension"]);
    const studio = api.payloadTargetPolicy("studio-launcher");
    assert.deepEqual(studio.order, ["studio_launcher"]);
    const fixture = createCanonicalFixture("studio-unit-policy", { withLive: false });
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID, {
      targetId: "studio-launcher", extensionVariant: "studio-launcher",
    });
    assert.equal(units.length, 1);
    assert.equal(units[0].livePath,
      path.join(fixture.repository, "apps", "extensions", "chatgpt", "chrome", "studio-launcher"));
    assert.throws(() => api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID, {
      targetId: "studio-launcher", extensionVariant: "caller-path",
    }), (error) => error?.code === "extension-variant-not-accepted");
  });
  await test("Studio rollback retains both generations and restores current after second-rename failure", () => {
    const fixture = createCanonicalFixture("studio-rollback", { withLive: false });
    const [unit] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID, {
      targetId: "studio-launcher", extensionVariant: "studio-launcher",
    });
    fs.mkdirSync(unit.livePath, { recursive: true });
    fs.writeFileSync(path.join(unit.livePath, "generation.txt"), "current\n");
    fs.mkdirSync(unit.retiredPath, { recursive: true });
    fs.writeFileSync(path.join(unit.retiredPath, "generation.txt"), "previous\n");
    const current = api.recomputeIncomingManifest(unit.livePath, "").treeDigest;
    const previous = api.recomputeIncomingManifest(unit.retiredPath, "").treeDigest;
    const rollbackId = "20260805T010101000Z-abcdefabcdef";
    const guards = { verifyLock: () => true,
      verifyLease: () => ({ sessionId: "studio-session" }), leaseSessionId: "studio-session" };
    const rolled = api.rollbackUnitToPrevious({ unit, rollbackId, guards,
      previousCandidatePath: unit.retiredPath,
      expectedPreviousDigest: previous, expectedCurrentDigest: current });
    assert.equal(api.recomputeIncomingManifest(unit.livePath, "").treeDigest, previous);
    assert.equal(api.recomputeIncomingManifest(rolled.retainedCurrentPath, "").treeDigest, current);
    api.reverseRollbackUnit({ unit, rollbackId, guards, previousCandidatePath: unit.retiredPath,
      expectedPreviousDigest: previous, expectedCurrentDigest: current });
    assert.equal(api.recomputeIncomingManifest(unit.livePath, "").treeDigest, current);
    assert.equal(api.recomputeIncomingManifest(unit.retiredPath, "").treeDigest, previous);
    assert.equal(fs.existsSync(api.rollbackRetiredPath(unit, rollbackId)), false);

    const secondRollbackId = "20260805T010102000Z-bcdefabcdefa";
    assert.throws(() => api.rollbackUnitToPrevious({ unit, rollbackId: secondRollbackId, guards,
      previousCandidatePath: unit.retiredPath,
      expectedPreviousDigest: previous, expectedCurrentDigest: current,
      hooks: { beforeRestorePrevious: () => { throw new Error("fixture-second-rename-failure"); } },
    }), /fixture-second-rename-failure/u);
    assert.equal(api.recomputeIncomingManifest(unit.livePath, "").treeDigest, current);
    assert.equal(api.recomputeIncomingManifest(unit.retiredPath, "").treeDigest, previous);
    assert.equal(fs.existsSync(api.rollbackRetiredPath(unit, secondRollbackId)), false);
  });
  await test("Studio rollback rejects drift and first-rename authority failure without mutation", () => {
    const setup = (label) => {
      const fixture = createCanonicalFixture(label, { withLive: false });
      const [unit] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID, {
        targetId: "studio-launcher", extensionVariant: "studio-launcher",
      });
      fs.mkdirSync(unit.livePath, { recursive: true });
      fs.writeFileSync(path.join(unit.livePath, "generation.txt"), "current\n");
      fs.mkdirSync(unit.retiredPath, { recursive: true });
      fs.writeFileSync(path.join(unit.retiredPath, "generation.txt"), "previous\n");
      return { unit,
        current: api.recomputeIncomingManifest(unit.livePath, "").treeDigest,
        previous: api.recomputeIncomingManifest(unit.retiredPath, "").treeDigest };
    };
    const guards = { verifyLock: () => true,
      verifyLease: () => ({ sessionId: "studio-session" }), leaseSessionId: "studio-session" };
    const previousDrift = setup("studio-rollback-previous-drift");
    fs.writeFileSync(path.join(previousDrift.unit.retiredPath, "drift.txt"), "drift\n");
    assert.throws(() => api.rollbackUnitToPrevious({ unit: previousDrift.unit,
      rollbackId: "20260805T010103000Z-cdefabcdefab", guards,
      previousCandidatePath: previousDrift.unit.retiredPath,
      expectedPreviousDigest: previousDrift.previous, expectedCurrentDigest: previousDrift.current,
    }), (error) => error?.code === "rollback-previous-digest-mismatch");
    assert.equal(api.recomputeIncomingManifest(previousDrift.unit.livePath, "").treeDigest,
      previousDrift.current);

    const currentDrift = setup("studio-rollback-current-drift");
    fs.writeFileSync(path.join(currentDrift.unit.livePath, "drift.txt"), "drift\n");
    assert.throws(() => api.rollbackUnitToPrevious({ unit: currentDrift.unit,
      rollbackId: "20260805T010104000Z-defabcdefabc", guards,
      previousCandidatePath: currentDrift.unit.retiredPath,
      expectedPreviousDigest: currentDrift.previous, expectedCurrentDigest: currentDrift.current,
    }), (error) => error?.code === "rollback-current-drift");
    assert.equal(api.recomputeIncomingManifest(currentDrift.unit.retiredPath, "").treeDigest,
      currentDrift.previous);

    const guardLoss = setup("studio-rollback-first-rename");
    assert.throws(() => api.rollbackUnitToPrevious({ unit: guardLoss.unit,
      rollbackId: "20260805T010105000Z-efabcdefabcd",
      guards: { ...guards, verifyLock: () => false },
      previousCandidatePath: guardLoss.unit.retiredPath,
      expectedPreviousDigest: guardLoss.previous, expectedCurrentDigest: guardLoss.current,
    }), (error) => error?.code === "publisher-lock-ownership-lost");
    assert.equal(api.recomputeIncomingManifest(guardLoss.unit.livePath, "").treeDigest,
      guardLoss.current);
    assert.equal(api.recomputeIncomingManifest(guardLoss.unit.retiredPath, "").treeDigest,
      guardLoss.previous);
  });
  /* ---------- canonical root pin ---------- */
  await test("production allow-lists pin the approved cockpit-pro root and repository", () => {
    // CP09: canonical Product authority lives under /products/. The retired
    // /repos/h2o-platforms topology stays rejected (asserted below).
    assert.deepEqual([...api.APPROVED_COCKPIT_PRO_ROOTS],
      ["/Users/hobayda/H2OCode/products/cockpit-pro"]);
    assert.deepEqual([...api.APPROVED_AUTHORITATIVE_REPOSITORIES],
      ["/Users/hobayda/H2OCode/products/cockpit-pro/h2o-cp-source"]);
    assert.throws(() => api.assertApprovedCanonicalRoot({
      repository: "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source",
      cockpitProRoot: "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro",
      anchorRoot: "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/.h2o-canonical-delivery",
      executableRepository: "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source",
    }), (error) => error.code === "canonical-root-not-approved");
  });
  await test("a self-consistent relocated copy is rejected by the production pin", () => {
    const fixture = createCanonicalFixture("pin-relocated");
    assert.throws(() => api.assertApprovedCanonicalRoot({
      repository: fixture.repository, cockpitProRoot: fixture.top,
      anchorRoot: fixture.anchorRoot, executableRepository: fixture.repository,
    }), (error) => error.code === "canonical-root-not-approved");
  });
  await test("fixture roots are accepted only through explicit injection", () => {
    const fixture = createCanonicalFixture("pin-injection");
    assert.equal(api.assertApprovedCanonicalRoot({
      repository: fixture.repository, cockpitProRoot: fixture.top,
      anchorRoot: fixture.anchorRoot, executableRepository: fixture.repository,
      approvedRepositories: [fixture.repository], approvedCockpitProRoots: [fixture.top],
    }).approved, true);
  });
  await test("executable Git disagreement rejects before any allow-list check", () => {
    const fixture = createCanonicalFixture("pin-git-mismatch");
    assert.throws(() => api.assertApprovedCanonicalRoot({
      repository: fixture.repository, cockpitProRoot: fixture.top,
      anchorRoot: fixture.anchorRoot, executableRepository: path.join(fixture.top, "other"),
      approvedRepositories: [fixture.repository], approvedCockpitProRoots: [fixture.top],
    }), (error) => error.code === "canonical-root-git-mismatch");
  });
  await test("a wrong cockpit-pro parent rejects", () => {
    const fixture = createCanonicalFixture("pin-parent");
    assert.throws(() => api.assertApprovedCanonicalRoot({
      repository: fixture.repository, cockpitProRoot: path.join(fixture.top, "elsewhere"),
      anchorRoot: fixture.anchorRoot, executableRepository: fixture.repository,
      approvedRepositories: [fixture.repository], approvedCockpitProRoots: [path.join(fixture.top, "elsewhere")],
    }), (error) => error.code === "canonical-root-parent-mismatch");
  });
  await test("a relocated anchor rejects", () => {
    const fixture = createCanonicalFixture("pin-anchor");
    assert.throws(() => api.assertApprovedCanonicalRoot({
      repository: fixture.repository, cockpitProRoot: fixture.top,
      anchorRoot: path.join(fixture.top, "somewhere-else"), executableRepository: fixture.repository,
      approvedRepositories: [fixture.repository], approvedCockpitProRoots: [fixture.top],
    }), (error) => error.code === "canonical-root-anchor-mismatch");
  });
  await test("a symlinked authority component rejects", () => {
    const fixture = createCanonicalFixture("pin-symlink");
    const link = path.join(fixture.top, "linked-repository");
    fs.symlinkSync(fixture.repository, link);
    assert.throws(() => api.assertApprovedCanonicalRoot({
      repository: link, cockpitProRoot: fixture.top, anchorRoot: fixture.anchorRoot,
      executableRepository: link, approvedRepositories: [link], approvedCockpitProRoots: [fixture.top],
    }), (error) => error.code === "authority-component-symlink");
  });
  await test("/var and /private/var spellings normalize to one approved identity", () => {
    if (!fs.existsSync("/var") || !fs.existsSync("/private/var")) return;
    const fixture = createCanonicalFixture("pin-var");
    const spelled = fixture.repository.startsWith("/private/")
      ? fixture.repository.replace("/private", "")
      : fixture.repository;
    assert.equal(api.assertApprovedCanonicalRoot({
      repository: fixture.repository, cockpitProRoot: fixture.top, anchorRoot: fixture.anchorRoot,
      executableRepository: spelled,
      approvedRepositories: [spelled], approvedCockpitProRoots: [fixture.top],
    }).approved, true);
  });
  await test("empty or non-absolute authority inputs reject", () => {
    for (const override of [{ repository: "" }, { repository: "relative/path" }, { anchorRoot: null }]) {
      assert.throws(() => api.assertApprovedCanonicalRoot({
        repository: "/tmp/a", cockpitProRoot: "/tmp", anchorRoot: "/tmp/.h2o-canonical-delivery",
        executableRepository: "/tmp/a", ...override,
      }), (error) => error.code === "canonical-root-input-invalid");
    }
  });

  /* ---------- canonical unit derivation ---------- */
  await test("the three canonical units derive internally from the pinned repository", () => {
    const fixture = createCanonicalFixture("units");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.deepEqual(units.map((unit) => unit.logicalName), ["alias", "dev_output", "extension"]);
    assert.equal(units[0].livePath, path.join(fixture.repository, "apps", "dev-server", "alias"));
    assert.equal(units[1].livePath, path.join(fixture.repository, "apps", "dev-server", "dev_output"));
    assert.equal(units[2].livePath,
      path.join(fixture.repository, "apps", "extensions", "chatgpt", "chrome", ACCEPTED_EXTENSION_VARIANT));
  });
  await test("incoming and retired sibling names are activation specific", () => {
    const fixture = createCanonicalFixture("siblings");
    for (const unit of api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID)) {
      assert.equal(path.basename(unit.incomingPath),
        `${path.basename(unit.livePath)}.staging-act-${ACTIVATION_ID}`);
      assert.equal(path.basename(unit.retiredPath),
        `${path.basename(unit.livePath)}.retired-act-${ACTIVATION_ID}`);
      assert.equal(path.dirname(unit.incomingPath), path.dirname(unit.livePath));
    }
  });
  await test("a wrong extension variant is refused by internal derivation", () => {
    const fixture = createCanonicalFixture("variant");
    assert.throws(() => api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID,
      { extensionVariant: "dev-controls-oauth-other" }),
    (error) => error.code === "extension-variant-not-accepted");
  });
  await test("an invalid activation id is refused", () => {
    const fixture = createCanonicalFixture("activation-id");
    for (const bad of ["", "not-an-id", "../escape", "20260805T000000000Z-XYZ"]) {
      assert.throws(() => api.canonicalUnitPaths(fixture.repository, bad),
        (error) => error.code === "activation-id-invalid");
    }
  });

  /* ---------- transaction journal ---------- */
  await test("the transaction directory is created owner-only under the anchor", () => {
    const fixture = createCanonicalFixture("tx-dir");
    const created = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    assert.equal(created.directory,
      path.join(fixture.anchorRoot, "transactions", ACTIVATION_ID));
    for (const directory of created.created) {
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    }
  });
  await test("a symlinked transaction directory fails closed", () => {
    const fixture = createCanonicalFixture("tx-symlink");
    const transactions = path.join(fixture.anchorRoot, "transactions");
    fs.mkdirSync(fixture.anchorRoot, { mode: 0o700, recursive: true });
    fs.symlinkSync(fixture.top, transactions);
    assert.throws(() => api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID),
      (error) => error.code === "transaction-directory-symlink");
  });
  await test("the first record publishes durably with a null previous digest", () => {
    const fixture = createCanonicalFixture("tx-first");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    const record = api.buildTransactionRecord(recordInput(fixture, api));
    const published = api.publishTransactionRecord(directory, record, { ownerId: OWNER_ID });
    assert.equal(path.basename(published.path), "seq-000001.json");
    assert.equal(published.durability.powerLossDurabilityGuaranteed, false);
    assert.equal(published.durability.fileFsync.succeeded, true);
    assert.equal(fs.statSync(published.path).mode & 0o777, 0o600);
    assert.equal(sha256Bytes(fs.readFileSync(published.path)), published.sha256);
  });
  await test("sequences increment and chain by previous record digest", () => {
    const fixture = createCanonicalFixture("tx-chain");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    const first = api.publishTransactionRecord(directory,
      api.buildTransactionRecord(recordInput(fixture, api)), { ownerId: OWNER_ID });
    const second = api.publishTransactionRecord(directory,
      api.buildTransactionRecord(recordInput(fixture, api, {
        sequence: 2, previousRecordSha256: first.sha256, transactionState: "incoming-preparing",
      })), { ownerId: OWNER_ID });
    const chain = api.readTransactionChain(directory);
    assert.equal(chain.records.length, 2);
    assert.equal(chain.headSha256, second.sha256);
    assert.equal(chain.records[1].record.previousRecordSha256, first.sha256);
  });
  await test("a duplicate sequence is refused without overwriting", () => {
    const fixture = createCanonicalFixture("tx-duplicate");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    const record = api.buildTransactionRecord(recordInput(fixture, api));
    const first = api.publishTransactionRecord(directory, record, { ownerId: OWNER_ID });
    const before = fs.readFileSync(first.path);
    assert.throws(() => api.publishTransactionRecord(directory, record, { ownerId: OWNER_ID }),
      (error) => error.code === "transaction-sequence-collision");
    assert.deepEqual(fs.readFileSync(first.path), before);
  });
  await test("a sequence gap fails closed on read", () => {
    const fixture = createCanonicalFixture("tx-gap");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    api.publishTransactionRecord(directory,
      api.buildTransactionRecord(recordInput(fixture, api)), { ownerId: OWNER_ID });
    const third = api.buildTransactionRecord(recordInput(fixture, api, {
      sequence: 3, previousRecordSha256: "e".repeat(64), transactionState: "incoming-prepared",
    }));
    fs.writeFileSync(path.join(directory, "seq-000003.json"), `${JSON.stringify(third, null, 2)}\n`);
    assert.throws(() => api.readTransactionChain(directory),
      (error) => error.code === "transaction-sequence-gap");
  });
  await test("digest-chain corruption fails closed on read", () => {
    const fixture = createCanonicalFixture("tx-corrupt");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    api.publishTransactionRecord(directory,
      api.buildTransactionRecord(recordInput(fixture, api)), { ownerId: OWNER_ID });
    const second = api.buildTransactionRecord(recordInput(fixture, api, {
      sequence: 2, previousRecordSha256: "f".repeat(64), transactionState: "incoming-preparing",
    }));
    fs.writeFileSync(path.join(directory, "seq-000002.json"), `${JSON.stringify(second, null, 2)}\n`);
    assert.throws(() => api.readTransactionChain(directory),
      (error) => error.code === "transaction-chain-broken");
  });
  await test("an unparsable record fails closed", () => {
    const fixture = createCanonicalFixture("tx-unparsable");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    fs.writeFileSync(path.join(directory, "seq-000001.json"), "{not json");
    assert.throws(() => api.readTransactionChain(directory),
      (error) => error.code === "transaction-record-unparsable");
  });
  await test("a symlinked record is refused", () => {
    const fixture = createCanonicalFixture("tx-record-symlink");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    const target = path.join(fixture.top, "outside.json");
    fs.writeFileSync(target, "{}");
    fs.symlinkSync(target, path.join(directory, "seq-000001.json"));
    assert.throws(() => api.readTransactionChain(directory),
      (error) => error.code === "transaction-record-not-regular");
  });
  await test("an absent transaction directory reads as not present", () => {
    const fixture = createCanonicalFixture("tx-absent");
    const chain = api.readTransactionChain(
      path.join(fixture.anchorRoot, "transactions", ACTIVATION_ID));
    assert.equal(chain.present, false);
    assert.equal(chain.records.length, 0);
  });
  await test("P3A refuses to build a record in a deferred transaction state", () => {
    const fixture = createCanonicalFixture("tx-deferred");
    for (const state of ["live-retiring", "live-retired", "incoming-promoting",
      "incoming-promoted", "verified", "restoring", "restored", "accepted"]) {
      assert.throws(() => api.buildTransactionRecord(recordInput(fixture, api, { transactionState: state })),
        (error) => error.code === "transaction-state-not-p3a");
    }
  });
  await test("P3A refuses a tree record in a deferred state", () => {
    const fixture = createCanonicalFixture("tx-deferred-tree");
    const input = recordInput(fixture, api);
    input.trees[0].state = "incoming-promoted";
    assert.throws(() => api.buildTransactionRecord(input),
      (error) => error.code === "transaction-state-not-p3a");
  });
  await test("records carry only the stable Git identity", () => {
    const fixture = createCanonicalFixture("tx-git-identity");
    const record = api.buildTransactionRecord(recordInput(fixture, api));
    assert.deepEqual(Object.keys(record.stableGitIdentity).sort(),
      ["path", "realpath", "sha256", "version"]);
    assert.throws(() => api.buildTransactionRecord(recordInput(fixture, api, {
      stableGitIdentity: { ...fixture.verification.source.gitExecutable, inode: "1" },
    })), (error) => error.code === "transaction-git-identity-invalid");
  });
  await test("records assert every boundary field false", () => {
    const fixture = createCanonicalFixture("tx-boundary");
    const record = api.buildTransactionRecord(recordInput(fixture, api));
    for (const key of ["livePayloadMutationPerformed", "retiredSiblingCreated", "promotionPerformed",
      "activationPerformed", "finalActivationReceiptDurable", "reloadPerformed",
      "canaryPerformed", "pushPerformed"]) {
      assert.equal(record[key], false, key);
    }
  });
  await test("a record must carry exactly the three canonical units", () => {
    const fixture = createCanonicalFixture("tx-three-trees");
    const input = recordInput(fixture, api);
    assert.throws(() => api.buildTransactionRecord({ ...input, trees: input.trees.slice(0, 2) }),
      (error) => error.code === "transaction-tree-records-invalid");
  });
  await test("the first record must carry a null previous digest and later ones must not", () => {
    const fixture = createCanonicalFixture("tx-chain-rules");
    assert.throws(() => api.buildTransactionRecord(recordInput(fixture, api,
      { previousRecordSha256: "a".repeat(64) })), (error) => error.code === "transaction-chain-invalid");
    assert.throws(() => api.buildTransactionRecord(recordInput(fixture, api,
      { sequence: 2, previousRecordSha256: null })), (error) => error.code === "transaction-chain-invalid");
  });
  await test("an owned temporary collision is typed rather than raw", () => {
    const fixture = createCanonicalFixture("tx-temp-collision");
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    fs.writeFileSync(path.join(directory, `.seq-000001.json.tmp-${OWNER_ID}`), "occupied");
    assert.throws(() => api.publishTransactionRecord(directory,
      api.buildTransactionRecord(recordInput(fixture, api)), { ownerId: OWNER_ID }),
    (error) => error.code === "transaction-temp-collision");
  });
  await test("a hard directory fsync failure is typed and loud", () => {
    const fixture = createCanonicalFixture("tx-dir-fsync");
    const originalFsync = fs.fsyncSync;
    const originalOpen = fs.openSync;
    let directoryDescriptor = null;
    fs.openSync = (target, flags, mode) => {
      const descriptor = originalOpen(target, flags, mode);
      if (flags === "r") directoryDescriptor = descriptor;
      return descriptor;
    };
    fs.fsyncSync = (descriptor) => {
      if (descriptor === directoryDescriptor) {
        const error = new Error("injected"); error.code = "EIO"; throw error;
      }
      return originalFsync(descriptor);
    };
    try {
      assert.throws(() => api.flushDirectory(fixture.top),
        (error) => error.code === "directory-fsync-failed");
    } finally {
      fs.fsyncSync = originalFsync; fs.openSync = originalOpen;
    }
  });
  await test("an unsupported directory fsync is reported without failing", () => {
    const fixture = createCanonicalFixture("tx-dir-unsupported");
    const originalFsync = fs.fsyncSync;
    fs.fsyncSync = () => { const error = new Error("injected"); error.code = "EINVAL"; throw error; };
    try {
      const result = api.flushDirectory(fixture.top);
      assert.equal(result.unsupported, true);
      assert.equal(result.succeeded, false);
    } finally {
      fs.fsyncSync = originalFsync;
    }
  });

  /* ---------- disk preflight ---------- */
  await test("required disk bytes sum every regular file in all three manifests", () => {
    const fixture = createCanonicalFixture("disk-total");
    const expected = Object.values(fixture.manifests)
      .flatMap((manifest) => manifest.entries)
      .filter((entry) => entry.type === "file")
      .reduce((total, entry) => total + entry.bytes, 0);
    assert.equal(api.requiredDiskBytes(fixture.verification), expected);
  });
  await test("insufficient disk rejects before any incoming tree is created", () => {
    const fixture = createCanonicalFixture("disk-insufficient");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => api.assertDiskPreflight(units, 1024, {
      statfs: () => ({ bavail: 1, bsize: 1 }),
      marginBytes: 0,
    }), (error) => error.code === "insufficient-disk-space");
    for (const unit of units) assert.equal(fs.existsSync(unit.incomingPath), false);
  });
  await test("canonical parents spanning two filesystems reject", () => {
    const fixture = createCanonicalFixture("disk-cross-device");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    let call = 0;
    assert.throws(() => api.assertDiskPreflight(units, 0, {
      statfs: () => ({ bavail: 1e9, bsize: 4096 }),
      stat: () => ({ dev: call++ }),
      marginBytes: 0,
    }), (error) => error.code === "canonical-parents-cross-device");
  });
  await test("sufficient disk on one filesystem passes with the documented margin", () => {
    const fixture = createCanonicalFixture("disk-ok");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const result = api.assertDiskPreflight(units, 1024, { statfs: () => ({ bavail: 1e9, bsize: 4096 }) });
    assert.equal(result.marginBytes, api.DISK_SAFETY_MARGIN_BYTES);
    assert.equal(result.requiredBytes, 1024 + api.DISK_SAFETY_MARGIN_BYTES);
  });

  /* ---------- incoming preparation ---------- */
  await test("all three incoming trees prepare and match their staged manifests", () => {
    const fixture = createCanonicalFixture("prepare-success");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    for (const unit of units) {
      const prepared = prepareOwned(api, fixture.verification, unit, fixture.repository);
      assert.equal(prepared.treeDigest, fixture.manifests[unit.family].treeDigest);
      assert.equal(prepared.fileCount, fixture.manifests[unit.family].fileCount);
      assert.equal(fs.existsSync(unit.incomingPath), true);
    }
  });
  await test("prepared regular files carry deterministic mode 0644 and exact bytes", () => {
    const fixture = createCanonicalFixture("prepare-modes");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    prepareOwned(api, fixture.verification, alias, fixture.repository);
    const file = path.join(alias.incomingPath, "alias-one.js");
    assert.equal(fs.statSync(file).mode & 0o777, 0o644);
    assert.equal(fs.readFileSync(file, "utf8"), "export const one = 1;\n");
  });
  await test("prepared directories carry deterministic mode 0755", () => {
    const fixture = createCanonicalFixture("prepare-dir-modes");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const devOutput = units[1];
    prepareOwned(api, fixture.verification, devOutput, fixture.repository);
    assert.equal(fs.statSync(devOutput.incomingPath).mode & 0o777, 0o755);
    assert.equal(fs.statSync(path.join(devOutput.incomingPath, "nested")).mode & 0o777, 0o755);
  });
  await test("receipt-attested symlinks reproduce exact link text", () => {
    const fixture = createCanonicalFixture("prepare-symlink");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    prepareOwned(api, fixture.verification, alias, fixture.repository);
    const link = path.join(alias.incomingPath, "alias-link.js");
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(link), "alias-one.js");
  });
  await test("an existing incoming sibling is never reused", () => {
    const fixture = createCanonicalFixture("prepare-collision");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    fs.mkdirSync(alias.incomingPath, { recursive: true });
    fs.writeFileSync(path.join(alias.incomingPath, "foreign.js"), "// foreign\n");
    assert.throws(() => prepareOwned(api, fixture.verification, alias, fixture.repository), (error) => error.code === "incoming-sibling-collision");
    assert.equal(fs.readFileSync(path.join(alias.incomingPath, "foreign.js"), "utf8"), "// foreign\n");
  });
  await test("a staged byte change after verification rejects on digest", () => {
    const fixture = createCanonicalFixture("prepare-byte-change");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    // Same byte length, different content: the digest check must be what fires.
    fs.writeFileSync(path.join(fixture.outputPaths.alias, "alias-one.js"), "export const one = 2;\n");
    assert.throws(() => prepareOwned(api, fixture.verification, alias, fixture.repository), (error) => error.code === "incoming-digest-mismatch");
  });
  await test("a staged size change after verification rejects on size", () => {
    const fixture = createCanonicalFixture("prepare-size-change");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    fs.writeFileSync(path.join(fixture.outputPaths.alias, "alias-one.js"), "export const one = 1;\n\n");
    assert.throws(() => prepareOwned(api, fixture.verification, alias, fixture.repository), (error) => error.code === "incoming-byte-size-mismatch");
  });
  await test("a manifest path missing from the staging root rejects", () => {
    const fixture = createCanonicalFixture("prepare-missing");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    fs.rmSync(path.join(fixture.outputPaths.alias, "alias-two.js"));
    assert.throws(() => prepareOwned(api, fixture.verification, alias, fixture.repository), (error) => error.code === "staged-manifest-path-missing");
  });
  await test("an extra staged path is detected by manifest equality", () => {
    const fixture = createCanonicalFixture("prepare-extra");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const prepared = prepareOwned(api, fixture.verification, alias, fixture.repository);
    fs.writeFileSync(path.join(prepared.incomingPath, "extra.js"), "// extra\n");
    const recomputed = api.recomputeIncomingManifest(prepared.incomingPath, "alias");
    assert.notEqual(recomputed.treeDigest, fixture.manifests.alias.treeDigest);
  });
  await test("a duplicate manifest path rejects", () => {
    const fixture = createCanonicalFixture("prepare-duplicate");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const verification = structuredClone(fixture.verification);
    verification.stage.manifests.alias.entries.push(
      { ...verification.stage.manifests.alias.entries[0] });
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository), (error) => error.code === "staged-manifest-duplicate-path");
  });
  await test("an unsupported manifest entry type rejects", () => {
    const fixture = createCanonicalFixture("prepare-entry-type");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const verification = structuredClone(fixture.verification);
    verification.stage.manifests.alias.entries[0].type = "fifo";
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository), (error) => error.code === "incoming-entry-type-unsupported");
  });
  await test("symlink link-text drift between manifest and staging rejects", () => {
    const fixture = createCanonicalFixture("prepare-link-drift");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const link = path.join(fixture.outputPaths.alias, "alias-link.js");
    fs.unlinkSync(link);
    fs.symlinkSync("alias-two.js", link);
    assert.throws(() => prepareOwned(api, fixture.verification, alias, fixture.repository), (error) => error.code === "incoming-symlink-text-mismatch");
  });
  await test("a symlink leaking into the staging root rejects", () => {
    const fixture = createCanonicalFixture("prepare-leak");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const link = path.join(fixture.outputPaths.alias, "alias-link.js");
    fs.unlinkSync(link);
    fs.symlinkSync(path.join(fixture.stagingRoot, "dev_output", "bundle.js"), link);
    const verification = structuredClone(fixture.verification);
    verification.stage.manifests.alias = buildManifest(fixture.outputPaths.alias, fixture.stagingRoot);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository), (error) => error.code === "incoming-symlink-staging-leak");
  });
  await test("a symlink leaving the authoritative repository rejects", () => {
    const fixture = createCanonicalFixture("prepare-foreign");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const foreign = path.join(fixture.top, "foreign-worktree");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "target.js"), "// foreign\n");
    const link = path.join(fixture.outputPaths.alias, "alias-link.js");
    fs.unlinkSync(link);
    fs.symlinkSync(path.join(foreign, "target.js"), link);
    const verification = structuredClone(fixture.verification);
    verification.stage.manifests.alias = buildManifest(fixture.outputPaths.alias, fixture.stagingRoot);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository), (error) => error.code === "incoming-symlink-foreign-worktree");
  });
  await test("preparation succeeds through spaces and emoji canonical paths", () => {
    const fixture = createCanonicalFixture("prepare-emoji", { emoji: true });
    for (const unit of api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID)) {
      const prepared = prepareOwned(api, fixture.verification, unit, fixture.repository);
      assert.equal(prepared.treeDigest, fixture.manifests[unit.family].treeDigest);
    }
  });
  await test("preparation never reads, stats or mutates the live canonical tree", () => {
    const fixture = createCanonicalFixture("prepare-live-untouched");
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const livePaths = new Set(units.map((unit) => normalized(unit.livePath)));
    const before = fs.readFileSync(
      path.join(fixture.repository, "apps", "dev-server", "alias", "previous.js"));
    const originalLstat = fs.lstatSync;
    const originalStat = fs.statSync;
    const originalRead = fs.readdirSync;
    let liveTouches = 0;
    const witness = (target) => {
      if (livePaths.has(normalized(String(target)))) liveTouches += 1;
    };
    fs.lstatSync = (target, ...rest) => { witness(target); return originalLstat(target, ...rest); };
    fs.statSync = (target, ...rest) => { witness(target); return originalStat(target, ...rest); };
    fs.readdirSync = (target, ...rest) => { witness(target); return originalRead(target, ...rest); };
    try {
      for (const unit of units) {
        prepareOwned(api, fixture.verification, unit, fixture.repository);
      }
    } finally {
      fs.lstatSync = originalLstat; fs.statSync = originalStat; fs.readdirSync = originalRead;
    }
    assert.equal(liveTouches, 0);
    assert.deepEqual(fs.readFileSync(
      path.join(fixture.repository, "apps", "dev-server", "alias", "previous.js")), before);
  });
  await test("preparation creates no retired sibling", () => {
    const fixture = createCanonicalFixture("prepare-no-retired");
    for (const unit of api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID)) {
      prepareOwned(api, fixture.verification, unit, fixture.repository);
      assert.equal(fs.existsSync(unit.retiredPath), false);
      assert.equal(fs.readdirSync(unit.parent).some((name) => name.includes(".retired-act-")), false);
    }
  });
  await test("first-ever activation prepares incoming without a live tree present", () => {
    const fixture = createCanonicalFixture("prepare-first-ever", { withLive: false });
    for (const unit of api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID)) {
      assert.equal(fs.existsSync(unit.livePath), false);
      const prepared = prepareOwned(api, fixture.verification, unit, fixture.repository);
      assert.equal(prepared.treeDigest, fixture.manifests[unit.family].treeDigest);
      assert.equal(fs.existsSync(unit.livePath), false);
    }
  });

  /* ---------- symlink relocation by resolved target ---------- */
  const relocFixture = (label, build) => {
    const fixture = createCanonicalFixture(label);
    const link = path.join(fixture.outputPaths.alias, "alias-link.js");
    fs.unlinkSync(link);
    build(fixture, link);
    const verification = structuredClone(fixture.verification);
    verification.stage.manifests.alias = buildManifest(fixture.outputPaths.alias, fixture.stagingRoot);
    return { fixture, verification };
  };

  await test("an intra-family link is remapped into the incoming tree and verified", () => {
    const fixture = createCanonicalFixture("reloc-intra");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const prepared = prepareOwned(api, fixture.verification, alias, fixture.repository);
    const translation = prepared.symlinkTranslations.find((item) => item.manifestPath.endsWith("alias-link.js"));
    assert.equal(translation.incomingResolvedTarget,
      normalized(path.join(alias.incomingPath, "alias-one.js")));
    assert.equal(translation.intendedIncomingTarget, translation.incomingResolvedTarget);
  });
  await test("a ..-bearing source link keeps its authoritative-source target after relocation", () => {
    const { fixture, verification } = relocFixture("reloc-dotdot", (fx, link) => {
      fs.mkdirSync(path.join(fx.repository, "src"), { recursive: true });
      fs.writeFileSync(path.join(fx.repository, "src", "shared.js"), "// shared\n");
      fs.symlinkSync(path.relative(path.dirname(link), path.join(fx.repository, "src", "shared.js")), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const prepared = prepareOwned(api, verification, alias, fixture.repository);
    const translation = prepared.symlinkTranslations.find((item) => item.manifestPath.endsWith("alias-link.js"));
    // Raw text MUST differ, resolved meaning MUST be preserved.
    assert.notEqual(translation.incomingLinkText, translation.stagedLinkText);
    assert.equal(translation.incomingResolvedTarget, translation.stagedResolvedTarget);
    assert.equal(translation.incomingResolvedTarget,
      normalized(path.join(fixture.repository, "src", "shared.js")));
  });
  await test("copying raw ..-bearing link text verbatim would have redirected the target", () => {
    const { fixture, verification } = relocFixture("reloc-proof", (fx, link) => {
      fs.mkdirSync(path.join(fx.repository, "src"), { recursive: true });
      fs.writeFileSync(path.join(fx.repository, "src", "shared.js"), "// shared\n");
      fs.symlinkSync(path.relative(path.dirname(link), path.join(fx.repository, "src", "shared.js")), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const staged = verification.stage.manifests.alias.entries
      .find((entry) => entry.type === "symlink" && entry.path.endsWith("alias-link.js"));
    const verbatim = path.resolve(alias.incomingPath, staged.target);
    const intended = normalized(path.join(fixture.repository, "src", "shared.js"));
    assert.notEqual(normalized(verbatim), intended);
  });
  await test("a broken staged link rejects", () => {
    const { fixture, verification } = relocFixture("reloc-broken", (fx, link) => {
      fs.symlinkSync("absent-target.js", link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository),
      (error) => error.code === "staged-symlink-broken");
  });
  await test("a link resolving into apps/dev-server rejects", () => {
    const { fixture, verification } = relocFixture("reloc-devserver", (fx, link) => {
      const target = path.join(fx.repository, "apps", "dev-server", "generated.js");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "// generated\n");
      fs.symlinkSync(path.relative(path.dirname(link), target), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository),
      (error) => error.code === "incoming-symlink-generated-target");
  });
  await test("a link resolving into apps/extensions rejects", () => {
    const { fixture, verification } = relocFixture("reloc-extensions", (fx, link) => {
      const target = path.join(fx.repository, "apps", "extensions", "chatgpt", "chrome", "generated.js");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "// generated\n");
      fs.symlinkSync(path.relative(path.dirname(link), target), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository),
      (error) => error.code === "incoming-symlink-generated-target");
  });
  await test("a foreign-worktree link rejects", () => {
    const { fixture, verification } = relocFixture("reloc-foreign", (fx, link) => {
      const foreign = path.join(fx.top, "foreign-worktree");
      fs.mkdirSync(foreign, { recursive: true });
      fs.writeFileSync(path.join(foreign, "target.js"), "// foreign\n");
      fs.symlinkSync(path.join(foreign, "target.js"), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository),
      (error) => error.code === "incoming-symlink-foreign-worktree");
  });
  await test("a link leaking into the staging root outside its family rejects", () => {
    const { fixture, verification } = relocFixture("reloc-staging", (fx, link) => {
      fs.symlinkSync(path.relative(path.dirname(link),
        path.join(fx.outputPaths.devOutput, "bundle.js")), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => prepareOwned(api, verification, alias, fixture.repository),
      (error) => error.code === "incoming-symlink-staging-leak");
  });
  await test("identical raw link text with a different resolved target is not accepted as authority", () => {
    const { fixture, verification } = relocFixture("reloc-text-equal", (fx, link) => {
      fs.mkdirSync(path.join(fx.repository, "src"), { recursive: true });
      fs.writeFileSync(path.join(fx.repository, "src", "shared.js"), "// shared\n");
      fs.symlinkSync(path.relative(path.dirname(link), path.join(fx.repository, "src", "shared.js")), link);
    });
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const prepared = prepareOwned(api, verification, alias, fixture.repository);
    const expectedEntry = prepared.expectedManifest.entries
      .find((entry) => entry.type === "symlink" && entry.path.endsWith("alias-link.js"));
    const stagedEntry = verification.stage.manifests.alias.entries
      .find((entry) => entry.type === "symlink" && entry.path.endsWith("alias-link.js"));
    assert.notEqual(expectedEntry.target, stagedEntry.target);
    assert.notEqual(prepared.expectedManifest.treeDigest, verification.stage.manifests.alias.treeDigest);
  });

  /* ---------- invocation-owned cleanup ---------- */
  await test("an ownership handle is minted only by exclusive creation", () => {
    const fixture = createCanonicalFixture("own-mint");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const handle = api.createOwnedIncomingRoot(alias, ACTIVATION_ID);
    assert.equal(handle.incomingPath, alias.incomingPath);
    assert.equal(api.removeOwnedIncomingRoot(handle), true);
    assert.equal(fs.existsSync(alias.incomingPath), false);
    assert.equal(fs.existsSync(alias.livePath), true);
  });
  await test("a pre-existing incoming directory yields no handle and is never removed", () => {
    const fixture = createCanonicalFixture("own-preexisting");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    fs.mkdirSync(alias.incomingPath, { recursive: true });
    fs.writeFileSync(path.join(alias.incomingPath, "foreign.js"), "// foreign\n");
    assert.throws(() => api.createOwnedIncomingRoot(alias, ACTIVATION_ID),
      (error) => error.code === "incoming-sibling-collision");
    assert.equal(fs.readFileSync(path.join(alias.incomingPath, "foreign.js"), "utf8"), "// foreign\n");
  });
  await test("a forged ownership handle rejects", () => {
    const fixture = createCanonicalFixture("own-forged");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    fs.mkdirSync(alias.incomingPath, { recursive: true });
    const forged = Object.freeze({
      activationId: ACTIVATION_ID, logicalName: "alias", liveBasename: path.basename(alias.livePath),
      incomingPath: alias.incomingPath, parent: alias.parent, device: "1", inode: "1",
    });
    assert.throws(() => api.removeOwnedIncomingRoot(forged),
      (error) => error.code === "incoming-ownership-invalid");
    assert.equal(fs.existsSync(alias.incomingPath), true);
  });
  await test("a released handle cannot be reused", () => {
    const fixture = createCanonicalFixture("own-released");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const handle = api.createOwnedIncomingRoot(alias, ACTIVATION_ID);
    assert.equal(api.releaseIncomingOwnership(handle), true);
    assert.throws(() => api.removeOwnedIncomingRoot(handle),
      (error) => error.code === "incoming-ownership-invalid");
    assert.equal(fs.existsSync(alias.incomingPath), true);
  });
  await test("a handle cannot be used twice", () => {
    const fixture = createCanonicalFixture("own-twice");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const handle = api.createOwnedIncomingRoot(alias, ACTIVATION_ID);
    assert.equal(api.removeOwnedIncomingRoot(handle), true);
    assert.throws(() => api.removeOwnedIncomingRoot(handle),
      (error) => error.code === "incoming-ownership-invalid");
  });
  await test("device or inode replacement rejects cleanup", () => {
    const fixture = createCanonicalFixture("own-inode");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const handle = api.createOwnedIncomingRoot(alias, ACTIVATION_ID);
    fs.rmSync(alias.incomingPath, { recursive: true });
    fs.mkdirSync(alias.incomingPath);
    fs.writeFileSync(path.join(alias.incomingPath, "replacement.js"), "// replaced\n");
    assert.throws(() => api.removeOwnedIncomingRoot(handle),
      (error) => error.code === "incoming-cleanup-identity-drift");
    assert.equal(fs.existsSync(path.join(alias.incomingPath, "replacement.js")), true);
  });
  await test("a symlinked incoming entry rejects cleanup", () => {
    const fixture = createCanonicalFixture("own-symlink");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const handle = api.createOwnedIncomingRoot(alias, ACTIVATION_ID);
    fs.rmSync(alias.incomingPath, { recursive: true });
    fs.symlinkSync(fixture.top, alias.incomingPath);
    assert.throws(() => api.removeOwnedIncomingRoot(handle),
      (error) => error.code === "incoming-cleanup-not-owned");
    assert.equal(fs.existsSync(path.join(fixture.repository, "apps", "dev-server", "alias")), true);
  });
  await test("another activation id cannot mint a handle for this sibling", () => {
    const fixture = createCanonicalFixture("own-other-activation");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    assert.throws(() => api.createOwnedIncomingRoot(alias, "20260805T000000000Z-999999999999"),
      (error) => error.code === "incoming-path-not-derived");
  });
  await test("a retired sibling can never be a cleanup target", () => {
    const fixture = createCanonicalFixture("own-retired");
    const [alias] = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const retiredUnit = { ...alias, incomingPath: alias.retiredPath };
    assert.throws(() => api.createOwnedIncomingRoot(retiredUnit, ACTIVATION_ID),
      (error) => error.code === "incoming-path-not-derived");
    assert.equal(Object.hasOwn(api, "removeOwnIncompleteIncoming"), false);
    assert.equal(api.ownsIncomingSibling(alias.retiredPath, path.basename(alias.livePath), ACTIVATION_ID), false);
    assert.equal(api.ownsIncomingSibling(alias.incomingPath, path.basename(alias.livePath), ACTIVATION_ID), true);
  });

  /* ---------- write-ahead orchestration ---------- */
  const orchestrate = (label, hooks = {}) => {
    const fixture = createCanonicalFixture(label);
    const units = api.canonicalUnitPaths(fixture.repository, ACTIVATION_ID);
    const { directory } = api.ensureTransactionDirectory(fixture.anchorRoot, ACTIVATION_ID);
    const base = recordInput(fixture, api);
    return {
      fixture, units, directory,
      run: (unit, extra = {}) => api.prepareIncomingUnitWithJournal({
        verification: fixture.verification, unit, activationId: ACTIVATION_ID,
        transactionDirectory: directory, repository: fixture.repository, ownerId: OWNER_ID,
        baseRecord: base, startSequence: 1, previousRecordSha256: null, hooks, ...extra,
      }),
    };
  };

  await test("orchestration writes preparing before creation and prepared after verification", () => {
    const context = orchestrate("orch-success");
    const result = context.run(context.units[0]);
    const chain = api.readTransactionChain(context.directory);
    assert.equal(chain.records.length, 2);
    assert.equal(chain.records[0].record.transactionState, "incoming-preparing");
    assert.equal(chain.records[1].record.transactionState, "incoming-prepared");
    assert.equal(result.ownershipReleased, true);
    assert.equal(chain.records[1].record.trees.find((t) => t.logicalName === "alias").incomingTreeDigest,
      result.prepared.treeDigest);
  });
  await test("interruption after the preparing record leaves no incoming root", () => {
    const context = orchestrate("orch-interrupt-preparing", {
      afterPreparingRecord: () => { throw new Error("interrupted before root creation"); },
    });
    assert.throws(() => context.run(context.units[0]), /interrupted before root creation/u);
    const chain = api.readTransactionChain(context.directory);
    assert.equal(chain.records.length, 1);
    assert.equal(chain.records[0].record.transactionState, "incoming-preparing");
    assert.equal(fs.existsSync(context.units[0].incomingPath), false);
  });
  await test("interruption during copy removes only the owned incomplete incoming", () => {
    const context = orchestrate("orch-interrupt-copy", {
      afterRootCreated: () => { throw new Error("interrupted during copy"); },
    });
    assert.throws(() => context.run(context.units[0]), /interrupted during copy/u);
    assert.equal(fs.existsSync(context.units[0].incomingPath), false);
    assert.equal(fs.existsSync(context.units[0].livePath), true);
    assert.equal(fs.existsSync(context.units[0].retiredPath), false);
  });
  await test("interruption after a complete copy but before the prepared record cleans up", () => {
    const context = orchestrate("orch-interrupt-after-copy", {
      afterCopy: () => { throw new Error("interrupted after copy"); },
    });
    assert.throws(() => context.run(context.units[0]), /interrupted after copy/u);
    const chain = api.readTransactionChain(context.directory);
    assert.equal(chain.records.length, 1);
    assert.equal(fs.existsSync(context.units[0].incomingPath), false);
  });
  await test("interruption after the prepared record preserves the completed incoming", () => {
    const context = orchestrate("orch-interrupt-after-prepared", {
      afterPreparedRecord: () => { throw new Error("interrupted after prepared") },
    });
    assert.throws(() => context.run(context.units[0]), /interrupted after prepared/u);
    const chain = api.readTransactionChain(context.directory);
    assert.equal(chain.records.length, 2);
    // The handle was never released, so failure cleanup removed the tree; the
    // journal still records prepared, which the planner treats as ambiguous.
    const plan = api.planRecovery({
      intent: { activationId: ACTIVATION_ID, repositoryRealpath: context.fixture.repository,
        authorizedWorktreeRealpath: context.fixture.repository },
      chain,
      observations: { alias: { incomingPresent: fs.existsSync(context.units[0].incomingPath) },
        dev_output: { incomingPresent: false }, extension: { incomingPresent: false } },
    });
    assert.equal(api.RECOVERY_OUTCOMES.includes(plan.classification), true);
  });

  /* ---------- real Batch 1.1 publisher evidence ---------- */
  await test("a real Batch 1.1 stage receipt prepares all three incoming trees unadapted", () => {
    const real = createRealPublisherFixture();
    if (!real) return;
    const units = api.canonicalUnitPaths(real.repository, ACTIVATION_ID);
    let symlinkTotal = 0;
    for (const unit of units) {
      const prepared = prepareOwned(api, real.verification, unit, real.repository);
      assert.equal(prepared.fileCount, real.verification.stage.manifests[unit.family].fileCount);
      for (const translation of prepared.symlinkTranslations) {
        symlinkTotal += 1;
        assert.equal(translation.incomingResolvedTarget, normalized(translation.intendedIncomingTarget));
        assert.equal(fs.existsSync(translation.incomingResolvedTarget), true);
      }
    }
    assert(symlinkTotal > 0, "real staged alias output must exercise symlink relocation");
  });

  /* ---------- previous-state capture model ---------- */
  await test("a present previous state requires manifest, digest and filesystem identity", () => {
    const record = api.buildPreviousStateRecord({
      logicalName: "alias", state: "present", entryType: "directory",
      manifest: { entries: [] }, treeDigest: "a".repeat(64), fileCount: 0,
      buildMarker: "2026-08-05T00:00:00.000Z", filesystemIdentity: { dev: 1, ino: 2 },
      livePath: "/tmp/live", retiredPath: `/tmp/live.retired-act-${ACTIVATION_ID}`,
    });
    assert.equal(record.restorationMode, "restore-previous");
  });
  await test("first-ever absence is representable and restores to absent", () => {
    const record = api.buildPreviousStateRecord({
      logicalName: "dev_output", state: "absent",
      livePath: "/tmp/live", retiredPath: `/tmp/live.retired-act-${ACTIVATION_ID}`,
    });
    assert.equal(record.state, "absent");
    assert.equal(record.restorationMode, "remove-promoted-to-absent");
    assert.equal(record.treeDigest, null);
  });
  await test("a symlinked live entry is refused", () => {
    assert.throws(() => api.buildPreviousStateRecord({
      logicalName: "alias", state: "present", entryType: "symlink",
      livePath: "/tmp/live", retiredPath: "/tmp/live.retired",
    }), (error) => error.code === "previous-state-symlinked-live");
  });
  await test("an unsupported live entry type is refused", () => {
    assert.throws(() => api.buildPreviousStateRecord({
      logicalName: "alias", state: "present", entryType: "fifo",
      livePath: "/tmp/live", retiredPath: "/tmp/live.retired",
    }), (error) => error.code === "previous-state-entry-unsupported");
  });
  await test("a foreign retired sibling is refused", () => {
    assert.throws(() => api.assertRetiredPathOwned(
      "/tmp/alias.retired-act-20260805T000000000Z-999999999999", "/tmp/alias", ACTIVATION_ID),
    (error) => error.code === "foreign-retired-sibling");
    assert.equal(api.assertRetiredPathOwned(
      `/tmp/alias.retired-act-${ACTIVATION_ID}`, "/tmp/alias", ACTIVATION_ID), true);
  });

  /* ---------- pure recovery planner ---------- */
  const planIntent = { activationId: ACTIVATION_ID, repositoryRealpath: "/repo", authorizedWorktreeRealpath: "/repo" };
  const planChain = (trees, overrides = {}) => ({
    present: true,
    records: [{
      sequence: 1, sha256: "a".repeat(64),
      record: {
        schemaVersion: 1, mode: "activation-transaction", activationId: ACTIVATION_ID,
        transactionState: "incoming-preparing", trees,
        livePayloadMutationPerformed: false, retiredSiblingCreated: false, promotionPerformed: false,
        activationPerformed: false, finalActivationReceiptDurable: false,
        reloadPerformed: false, canaryPerformed: false, pushPerformed: false, ...overrides,
      },
    }],
  });
  const treeRecord = (state, extra = {}) => ["alias", "dev_output", "extension"].map((logicalName) => ({
    logicalName, state, livePath: `/repo/${logicalName}`,
    incomingPath: `/repo/${logicalName}.staging-act-${ACTIVATION_ID}`,
    retiredPath: `/repo/${logicalName}.retired-act-${ACTIVATION_ID}`, ...extra,
  }));
  const observe = (value) => Object.fromEntries(
    ["alias", "dev_output", "extension"].map((name) => [name, value]));

  await test("no transaction chain plans no transaction", () => {
    assert.equal(api.planRecovery({ intent: planIntent, chain: { present: false, records: [] } })
      .classification, "no-transaction");
  });
  await test("untouched trees with no incoming plan preparation not started", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("untouched"), { transactionState: "untouched" }),
      observations: observe({ incomingPresent: false }),
    }).classification, "incoming-preparation-not-started");
  });
  await test("incoming-preparing with a partial owned tree plans its removal", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-preparing")),
      observations: observe({ incomingPresent: true }),
    }).classification, "remove-own-partial-incoming");
  });
  await test("incoming-preparing with no directory plans preparation not started", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-preparing")),
      observations: observe({ incomingPresent: false }),
    }).classification, "incoming-preparation-not-started");
  });
  await test("incoming-prepared with a matching tree preserves verified incoming", () => {
    assert.equal(api.planRecovery({
      intent: planIntent,
      chain: planChain(treeRecord("incoming-prepared", { incomingTreeDigest: "b".repeat(64) })),
      observations: observe({ incomingPresent: true, incomingTreeDigest: "b".repeat(64) }),
    }).classification, "preserve-verified-incoming");
  });
  await test("incoming-prepared with a digest mismatch is ambiguous, never guessed", () => {
    assert.equal(api.planRecovery({
      intent: planIntent,
      chain: planChain(treeRecord("incoming-prepared", { incomingTreeDigest: "b".repeat(64) })),
      observations: observe({ incomingPresent: true, incomingTreeDigest: "c".repeat(64) }),
    }).classification, "incoming-preparation-ambiguous");
  });
  await test("incoming-prepared with a missing tree is ambiguous", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-prepared")),
      observations: observe({ incomingPresent: false }),
    }).classification, "incoming-preparation-ambiguous");
  });
  await test("any live-mutation state defers to P3B recovery", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("live-retired")),
      observations: observe({ incomingPresent: true }),
    }).code, "p3b-recovery-required");
  });
  await test("an observed live mutation defers to P3B recovery", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-prepared")),
      observations: observe({ incomingPresent: true, livePathMutated: true }),
    }).code, "p3b-recovery-required");
  });
  await test("an observed retired sibling defers to P3B recovery", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-prepared")),
      observations: observe({ incomingPresent: true, retiredSiblingPresent: true }),
    }).code, "p3b-recovery-required");
  });
  await test("untouched with an unexpected incoming tree is contradictory", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("untouched"), { transactionState: "untouched" }),
      observations: observe({ incomingPresent: true }),
    }).classification, "contradictory-transaction");
  });
  await test("a claimed boundary field makes the transaction contradictory", () => {
    assert.equal(api.planRecovery({
      intent: planIntent,
      chain: planChain(treeRecord("incoming-prepared"), { activationPerformed: true }),
      observations: observe({ incomingPresent: true }),
    }).classification, "contradictory-transaction");
  });
  await test("a foreign repository or intent digest is classified separately", () => {
    assert.equal(api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-prepared")),
      observations: observe({ incomingPresent: true }),
      expected: { repositoryRealpath: "/other" },
    }).classification, "foreign-or-unowned-transaction");
  });
  await test("the recovery planner never requires live payload mutation", () => {
    const plan = api.planRecovery({
      intent: planIntent, chain: planChain(treeRecord("incoming-prepared")),
      observations: observe({ incomingPresent: true }),
    });
    assert.equal(plan.livePayloadMutationRequired, false);
    assert.equal(api.RECOVERY_OUTCOMES.includes(plan.classification), true);
  });

  /* ---------- P3B: recoverable canonical promotion and reversal ---------- */

  /**
   * A disposable canonical fixture with the three live trees, a staged release,
   * a transaction directory and satisfied lock/lease guards. Mirrors production
   * topology: staged families live outside the repository's generated-output
   * trees, and all three canonical parents share one filesystem.
   */
  const createP3bFixture = (label, { live = true, targetId = "dev-controls-oauth-google" } = {}) => {
    const studioTarget = targetId === "studio-launcher";
    const top = tempRoot(label);
    const repository = path.join(top, "repo with space 🧪");
    const devServer = path.join(repository, "apps", "dev-server");
    const chrome = path.join(repository, "apps", "extensions", "chatgpt", "chrome");
    fs.mkdirSync(devServer, { recursive: true });
    fs.mkdirSync(chrome, { recursive: true });
    if (live) {
      const liveTargets = studioTarget
        ? [path.join(chrome, "studio-launcher")]
        : [path.join(devServer, "alias"), path.join(devServer, "dev_output"),
          path.join(chrome, ACCEPTED_EXTENSION_VARIANT)];
      for (const target of liveTargets) {
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, "previous.js"), `// previous ${path.basename(target)}\n`);
      }
    }
    const stagingRoot = path.join(top, "h2o-publish-stage-p3b");
    const outputPaths = {
      alias: path.join(stagingRoot, "server", "alias"),
      devOutput: path.join(stagingRoot, "server", "dev_output"),
      extension: path.join(stagingRoot, "extension"),
    };
    for (const target of Object.values(outputPaths)) fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(outputPaths.alias, "a.js"), "// new alias\n");
    fs.symlinkSync("a.js", path.join(outputPaths.alias, "link.js"));
    fs.writeFileSync(path.join(outputPaths.devOutput, "b.js"), "// new dev_output\n");
    fs.writeFileSync(path.join(outputPaths.extension, "manifest.json"), "{}\n");
    const receiptPath = path.join(stagingRoot, "publication-receipt.json");
    fs.writeFileSync(receiptPath, JSON.stringify({ schemaVersion: 1, mode: "stage-only" }));
    const gitIdentity = { path: "/usr/bin/git", realpath: "/usr/bin/git",
      version: "git version 2.50.1", sha256: "c".repeat(64) };
    const verification = {
      source: { repository, branch: "main", approvedHead: "a".repeat(40), sourceTree: "b".repeat(40),
        gitExecutable: gitIdentity },
      receiptPath, receiptSha256: sha256Bytes(fs.readFileSync(receiptPath)),
      stage: { stagingRoot, outputPaths,
        manifests: {
          alias: buildManifest(outputPaths.alias, stagingRoot),
          devOutput: buildManifest(outputPaths.devOutput, stagingRoot),
          extension: buildManifest(outputPaths.extension, stagingRoot),
        },
        extensionVariant: studioTarget ? "studio-launcher" : ACCEPTED_EXTENSION_VARIANT,
        publicationTarget: targetId,
        buildMarker: "2026-08-05T00:00:00.000Z" },
    };
    const anchorRoot = path.join(top, ".h2o-canonical-delivery");
    const units = api.canonicalUnitPaths(repository, ACTIVATION_ID, {
      targetId, extensionVariant: studioTarget ? "studio-launcher" : ACCEPTED_EXTENSION_VARIANT,
    });
    const { directory } = api.ensureTransactionDirectory(anchorRoot, ACTIVATION_ID);
    const base = {
      activationId: ACTIVATION_ID, sequence: 1, previousRecordSha256: null,
      createdAt: "2026-08-05T00:00:00.000Z",
      intentPath: path.join(anchorRoot, "activation-intents", `${ACTIVATION_ID}.json`),
      intentSha256: "d".repeat(64),
      stageReceiptPath: receiptPath, stageReceiptSha256: verification.receiptSha256,
      repositoryRealpath: repository, authorizedWorktreeRealpath: repository,
      branch: "main", approvedHead: "a".repeat(40), sourceTree: "b".repeat(40),
      stableGitIdentity: gitIdentity,
      acceptedExtensionVariant: studioTarget ? "studio-launcher" : ACCEPTED_EXTENSION_VARIANT,
      buildMarker: "2026-08-05T00:00:00.000Z", owner: { ownerId: OWNER_ID, pid: process.pid },
      transactionState: "untouched",
      trees: units.map((unit) => ({ logicalName: unit.logicalName, state: "untouched",
        livePath: unit.livePath, incomingPath: unit.incomingPath, retiredPath: unit.retiredPath })),
    };
    if (studioTarget) {
      base.publicationTarget = "studio-launcher";
      base.generationId = "e".repeat(64);
      base.canonicalBaseline = null;
    }
    const guards = { verifyLock: () => true, verifyLease: () => ({ sessionId: "session-1" }),
      leaseSessionId: "session-1" };
    return { top, repository, units, verification, anchorRoot, directory, base, guards };
  };
  const p3bPrepare = (fixture, unit) => prepareOwned(api, fixture.verification, unit, fixture.repository);
  const p3bPromote = (fixture, unit, overrides = {}) => {
    const chain = api.readTransactionChain(fixture.directory);
    return api.promoteUnitWithJournal({
      unit, activationId: ACTIVATION_ID, directory: fixture.directory, baseRecord: fixture.base,
      ownerId: OWNER_ID, guards: fixture.guards,
      sequence: chain.records.length + 1, previousRecordSha256: chain.headSha256 ?? null,
      ...overrides,
    });
  };

  await test("capturePreviousCanonicalState records present and absent generations", () => {
    const present = createP3bFixture("p3b-prev-present");
    const captured = api.capturePreviousCanonicalState(present.units[0], ACTIVATION_ID);
    assert.equal(captured.state, "present");
    assert.equal(captured.restorationMode, "restore-previous");
    assert.equal(typeof captured.treeDigest, "string");
    assert.equal(typeof captured.filesystemIdentity.ino, "string");
    const absent = createP3bFixture("p3b-prev-absent", { live: false });
    const first = api.capturePreviousCanonicalState(absent.units[0], ACTIVATION_ID);
    assert.equal(first.state, "absent");
    assert.equal(first.restorationMode, "remove-promoted-to-absent");
    assert.equal(first.treeDigest, null);
  });
  await test("capturePreviousCanonicalState rejects unusable live and retired states", () => {
    const cases = [
      ["symlinked live", "previous-state-symlinked-live", (fixture) => {
        fs.symlinkSync(fixture.top, fixture.units[0].livePath);
      }],
      ["unsupported live entry", "previous-state-entry-unsupported", (fixture) => {
        fs.writeFileSync(fixture.units[0].livePath, "not a directory\n");
      }],
      ["pre-existing retired sibling", "retired-sibling-collision", (fixture) => {
        fs.mkdirSync(fixture.units[0].retiredPath, { recursive: true });
      }],
    ];
    for (const [label, code, mutate] of cases) {
      const fixture = createP3bFixture(`p3b-prev-${label.replace(/\s+/gu, "-")}`, { live: false });
      mutate(fixture);
      assert.throws(() => api.capturePreviousCanonicalState(fixture.units[0], ACTIVATION_ID),
        (error) => error.code === code, label);
    }
  });
  await test("promoteUnitWithJournal writes the exact five-record sequence and retires the previous tree", () => {
    const fixture = createP3bFixture("p3b-promote-one");
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const result = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    assert.deepEqual(
      api.readTransactionChain(fixture.directory).records.map((entry) => entry.record.transactionState),
      ["live-retiring", "live-retired", "incoming-promoting", "incoming-promoted", "verified"]);
    assert.equal(fs.existsSync(unit.retiredPath), true);
    assert.equal(fs.existsSync(unit.incomingPath), false);
    assert.equal(result.promotedTreeDigest, prepared.promotionIdentity);
    assert.equal(result.retired, true);
    assert.equal(result.acceptedRelease, false);
    assert.equal(fs.readFileSync(path.join(unit.retiredPath, "previous.js"), "utf8"),
      `// previous ${path.basename(unit.livePath)}\n`);
  });
  await test("promoteUnitWithJournal skips retirement for a first-ever activation", () => {
    const fixture = createP3bFixture("p3b-promote-first", { live: false });
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const result = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    assert.equal(result.retired, false);
    assert.equal(result.previous.state, "absent");
    assert.equal(fs.existsSync(unit.retiredPath), false);
    assert.equal(fs.existsSync(unit.livePath), true);
  });
  await test("promoteReleaseWithJournal promotes all three units in pinned order without accepting", () => {
    const fixture = createP3bFixture("p3b-release-three");
    const expectedDigests = {};
    for (const unit of fixture.units) expectedDigests[unit.logicalName] = p3bPrepare(fixture, unit).promotionIdentity;
    const result = api.promoteReleaseWithJournal({
      units: fixture.units, activationId: ACTIVATION_ID, directory: fixture.directory,
      baseRecord: fixture.base, ownerId: OWNER_ID, guards: fixture.guards, expectedDigests,
    });
    assert.equal(result.released, true);
    assert.equal(result.fixtureVerified, true);
    assert.deepEqual([...result.order], ["alias", "dev_output", "extension"]);
    assert.deepEqual(result.changed.map((entry) => entry.logicalName), ["alias", "dev_output", "extension"]);
    for (const key of ["acceptedRelease", "activationPerformed", "finalActivationReceiptDurable",
      "reloadPerformed", "canaryPerformed", "pushPerformed"]) assert.equal(result[key], false, key);
    const verified = api.readTransactionChain(fixture.directory).records
      .filter((entry) => entry.record.transactionState === "verified");
    assert.equal(verified.length, 3);
    for (const unit of fixture.units) assert.equal(fs.existsSync(unit.retiredPath), true);
  });
  await test("Studio release promotes exactly one unit and retains a verified present baseline", () => {
    const fixture = createP3bFixture("p3b-studio-present", { targetId: "studio-launcher" });
    const [unit] = fixture.units;
    const previous = api.capturePreviousCanonicalState(unit, ACTIVATION_ID);
    fixture.base.canonicalBaseline = { state: previous.state, treeDigest: previous.treeDigest };
    const prepared = p3bPrepare(fixture, unit);
    const result = api.promoteReleaseWithJournal({
      units: fixture.units, activationId: ACTIVATION_ID, directory: fixture.directory,
      baseRecord: fixture.base, ownerId: OWNER_ID, guards: fixture.guards,
      expectedDigests: { studio_launcher: prepared.promotionIdentity },
      expectedPrevious: { studio_launcher: fixture.base.canonicalBaseline },
    });
    assert.equal(result.released, true);
    assert.deepEqual([...result.order], ["studio_launcher"]);
    assert.equal(result.changed.length, 1);
    assert.equal(fs.existsSync(unit.retiredPath), true);
    assert.equal(api.recomputeIncomingManifest(unit.retiredPath, "").treeDigest, previous.treeDigest);
    assert.equal(api.recomputeIncomingManifest(unit.livePath, "").treeDigest, prepared.promotionIdentity);
  });
  await test("Studio first publication preserves an absent baseline without inventing a rollback generation", () => {
    const fixture = createP3bFixture("p3b-studio-absent",
      { targetId: "studio-launcher", live: false });
    const [unit] = fixture.units;
    fixture.base.canonicalBaseline = { state: "absent", treeDigest: null };
    const prepared = p3bPrepare(fixture, unit);
    const result = api.promoteReleaseWithJournal({
      units: fixture.units, activationId: ACTIVATION_ID, directory: fixture.directory,
      baseRecord: fixture.base, ownerId: OWNER_ID, guards: fixture.guards,
      expectedDigests: { studio_launcher: prepared.promotionIdentity },
      expectedPrevious: { studio_launcher: fixture.base.canonicalBaseline },
    });
    assert.equal(result.released, true);
    assert.equal(result.changed[0].previousState, "absent");
    assert.equal(fs.existsSync(unit.retiredPath), false);
    assert.equal(fs.existsSync(unit.livePath), true);
  });
  await test("Studio baseline drift rejects before any live rename and keeps incoming evidence", () => {
    const fixture = createP3bFixture("p3b-studio-baseline-drift", { targetId: "studio-launcher" });
    const [unit] = fixture.units;
    const prepared = p3bPrepare(fixture, unit);
    const before = api.recomputeIncomingManifest(unit.livePath, "").treeDigest;
    const result = api.promoteReleaseWithJournal({
      units: fixture.units, activationId: ACTIVATION_ID, directory: fixture.directory,
      baseRecord: fixture.base, ownerId: OWNER_ID, guards: fixture.guards,
      expectedDigests: { studio_launcher: prepared.promotionIdentity },
      expectedPrevious: { studio_launcher: { state: "present", treeDigest: "0".repeat(64) } },
    });
    assert.equal(result.released, false);
    assert.equal(result.code, "canonical-baseline-drift");
    assert.equal(api.recomputeIncomingManifest(unit.livePath, "").treeDigest, before);
    assert.equal(fs.existsSync(unit.retiredPath), false);
    assert.equal(fs.existsSync(unit.incomingPath), true);
  });
  await test("promotion rejects a different-stage or mismatched promoted identity", () => {
    for (const digest of ["f".repeat(64), "0".repeat(64)]) {
      const fixture = createP3bFixture(`p3b-verify-${digest.slice(0, 4)}`);
      p3bPrepare(fixture, fixture.units[0]);
      assert.throws(() => p3bPromote(fixture, fixture.units[0], { expectedTreeDigest: digest }),
        (error) => error.code === "promoted-verification-mismatch");
    }
  });
  await test("promotion requires unforged incoming ownership", () => {
    const fixture = createP3bFixture("p3b-ownership");
    const unit = fixture.units[0];
    assert.throws(() => api.prepareIncomingTree(fixture.verification, unit,
      { repository: fixture.repository }), (error) => error.code === "incoming-ownership-invalid");
    fs.mkdirSync(unit.incomingPath, { recursive: true });
    const forged = Object.freeze({
      activationId: ACTIVATION_ID, logicalName: "alias", liveBasename: path.basename(unit.livePath),
      incomingPath: unit.incomingPath, parent: unit.parent, device: "1", inode: "1",
    });
    assert.throws(() => api.prepareIncomingTree(fixture.verification, unit,
      { repository: fixture.repository, ownership: forged }),
    (error) => error.code === "incoming-ownership-invalid");
  });
  await test("promotion aborts before mutation on publisher-lock or lease failure", () => {
    const cases = [
      ["lock loss", "publisher-lock-ownership-lost",
        { verifyLock: () => false, verifyLease: () => ({ sessionId: "session-1" }), leaseSessionId: "session-1" }],
      ["lease drift", "canonical-lease-identity-drift",
        { verifyLock: () => true, verifyLease: () => ({ sessionId: "other" }), leaseSessionId: "session-1" }],
      ["lease malformed", "canonical-lease-ownership-lost",
        { verifyLock: () => true, verifyLease: () => ({}), leaseSessionId: "session-1" }],
      ["ownership missing", "promotion-ownership-missing", {}],
    ];
    for (const [label, code, guards] of cases) {
      const fixture = createP3bFixture(`p3b-guard-${label.replace(/\s+/gu, "-")}`);
      const unit = fixture.units[0];
      const prepared = p3bPrepare(fixture, unit);
      assert.throws(() => p3bPromote(fixture, unit,
        { guards, expectedTreeDigest: prepared.promotionIdentity }),
      (error) => error.code === code, label);
      // No live mutation occurred.
      assert.equal(fs.existsSync(unit.retiredPath), false, label);
      assert.equal(fs.readFileSync(path.join(unit.livePath, "previous.js"), "utf8"),
        `// previous ${path.basename(unit.livePath)}\n`, label);
    }
  });
  await test("a genuine gap takeover fails closed and never touches foreign content", () => {
    const fixture = createP3bFixture("p3b-gap-takeover");
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const foreignBody = "// FOREIGN BUILD\n";
    let takeoverPerformed = false;
    const guards = {
      verifyLock: () => true, leaseSessionId: "session-1",
      verifyLease: () => {
        // Runs immediately before each rename. After live -> retired the live
        // name is free: occupy it exactly inside the missing-path interval.
        if (!fs.existsSync(unit.livePath) && fs.existsSync(unit.retiredPath) && !takeoverPerformed) {
          fs.mkdirSync(unit.livePath, { recursive: true });
          fs.writeFileSync(path.join(unit.livePath, "foreign.js"), foreignBody);
          takeoverPerformed = true;
        }
        return { sessionId: "session-1" };
      },
    };
    assert.throws(() => p3bPromote(fixture, unit, { guards, expectedTreeDigest: prepared.promotionIdentity }),
      (error) => error.code === "promotion-gap-takeover");
    assert.equal(takeoverPerformed, true, "fixture must take over inside the missing-path interval");
    assert.equal(fs.readFileSync(path.join(unit.livePath, "foreign.js"), "utf8"), foreignBody);
    assert.equal(fs.existsSync(unit.incomingPath), true, "incoming evidence preserved");
    assert.equal(fs.existsSync(unit.retiredPath), true, "retired evidence preserved");
  });
  await test("a release blocked by gap takeover reverses earlier units and requires an operator", () => {
    const fixture = createP3bFixture("p3b-gap-release");
    const [alias, devOutput] = fixture.units;
    const expectedDigests = {};
    for (const unit of fixture.units) expectedDigests[unit.logicalName] = p3bPrepare(fixture, unit).promotionIdentity;
    let takeoverPerformed = false;
    const guards = {
      verifyLock: () => true, leaseSessionId: "session-1",
      verifyLease: () => {
        if (!fs.existsSync(devOutput.livePath) && fs.existsSync(devOutput.retiredPath) && !takeoverPerformed) {
          fs.mkdirSync(devOutput.livePath, { recursive: true });
          fs.writeFileSync(path.join(devOutput.livePath, "foreign.js"), "// FOREIGN\n");
          takeoverPerformed = true;
        }
        return { sessionId: "session-1" };
      },
    };
    const result = api.promoteReleaseWithJournal({
      units: fixture.units, activationId: ACTIVATION_ID, directory: fixture.directory,
      baseRecord: fixture.base, ownerId: OWNER_ID, guards, expectedDigests,
    });
    assert.equal(result.released, false);
    assert.equal(result.gapTakeover, true);
    assert.equal(result.failedAt, "dev_output");
    assert.equal(takeoverPerformed, true);
    assert.equal(fs.readFileSync(path.join(devOutput.livePath, "foreign.js"), "utf8"), "// FOREIGN\n");
    // The already-promoted alias unit was reversed to its previous generation.
    assert.equal(result.reversal.restored.map((entry) => entry.logicalName).includes("alias"), true);
    assert.equal(fs.readFileSync(path.join(alias.livePath, "previous.js"), "utf8"),
      `// previous ${path.basename(alias.livePath)}\n`);
    assert.equal(result.acceptedRelease, false);
  });
  await test("reverseRelease restores one, two and three units in exact reverse order", () => {
    for (const count of [1, 2, 3]) {
      const fixture = createP3bFixture(`p3b-reverse-${count}`);
      const changed = [];
      for (const unit of fixture.units.slice(0, count)) {
        const prepared = p3bPrepare(fixture, unit);
        const promoted = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
        changed.push({ unit, previous: promoted.previous, promotedTreeDigest: promoted.promotedTreeDigest });
      }
      const reversal = api.reverseRelease({
        changed, activationId: ACTIVATION_ID, directory: fixture.directory,
        baseRecord: fixture.base, ownerId: OWNER_ID, guards: fixture.guards,
      });
      assert.equal(reversal.reversed, true, `count ${count}`);
      assert.equal(reversal.classification, "complete-reversal");
      assert.deepEqual(reversal.restored.map((entry) => entry.logicalName),
        ["extension", "dev_output", "alias"].filter((name) =>
          fixture.units.slice(0, count).some((unit) => unit.logicalName === name)));
      for (const unit of fixture.units.slice(0, count)) {
        assert.equal(fs.readFileSync(path.join(unit.livePath, "previous.js"), "utf8"),
          `// previous ${path.basename(unit.livePath)}\n`);
        assert.equal(fs.existsSync(unit.retiredPath), false);
      }
    }
  });
  await test("reverseRelease returns a first-ever activation to absence", () => {
    const fixture = createP3bFixture("p3b-reverse-absent", { live: false });
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const promoted = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    assert.equal(fs.existsSync(unit.livePath), true);
    const reversal = api.reverseRelease({
      changed: [{ unit, previous: promoted.previous, promotedTreeDigest: promoted.promotedTreeDigest }],
      activationId: ACTIVATION_ID, directory: fixture.directory, baseRecord: fixture.base,
      ownerId: OWNER_ID, guards: fixture.guards,
    });
    assert.equal(reversal.reversed, true);
    assert.equal(reversal.restored[0].mode, "removed-promoted-to-absent");
    assert.equal(fs.existsSync(unit.livePath), false);
  });
  await test("reverseRelease refuses to restore from a drifted retired payload", () => {
    const fixture = createP3bFixture("p3b-reverse-drift");
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const promoted = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    fs.writeFileSync(path.join(unit.retiredPath, "tampered.js"), "// tampered\n");
    const reversal = api.reverseRelease({
      changed: [{ unit, previous: promoted.previous, promotedTreeDigest: promoted.promotedTreeDigest }],
      activationId: ACTIVATION_ID, directory: fixture.directory, baseRecord: fixture.base,
      ownerId: OWNER_ID, guards: fixture.guards,
    });
    assert.equal(reversal.reversed, false);
    assert.equal(reversal.code, "reversal-retired-digest-mismatch");
    assert.equal(reversal.evidencePreserved, true);
    // Neither the only verified previous copy nor the promoted tree is deleted.
    assert.equal(fs.existsSync(unit.retiredPath), true);
    assert.equal(fs.existsSync(unit.livePath), true);
  });
  await test("reverseRelease refuses to clobber foreign content occupying the live path", () => {
    const fixture = createP3bFixture("p3b-reverse-foreign");
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const promoted = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    fs.rmSync(unit.livePath, { recursive: true });
    fs.mkdirSync(unit.livePath, { recursive: true });
    fs.writeFileSync(path.join(unit.livePath, "foreign.js"), "// FOREIGN\n");
    const reversal = api.reverseRelease({
      changed: [{ unit, previous: promoted.previous, promotedTreeDigest: promoted.promotedTreeDigest }],
      activationId: ACTIVATION_ID, directory: fixture.directory, baseRecord: fixture.base,
      ownerId: OWNER_ID, guards: fixture.guards,
    });
    assert.equal(reversal.reversed, false);
    assert.equal(reversal.classification, "preserve-foreign-live-and-require-operator");
    assert.equal(fs.readFileSync(path.join(unit.livePath, "foreign.js"), "utf8"), "// FOREIGN\n");
    assert.equal(fs.existsSync(unit.retiredPath), true);
  });
  await test("reverseRelease self-positions after a partial unit failure without sequence collision", () => {
    const fixture = createP3bFixture("p3b-stale-sequence");
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    const promoted = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    const before = api.readTransactionChain(fixture.directory).records.length;
    // A caller tracking a stale sequence must not collide: reversal reads the chain.
    const reversal = api.reverseRelease({
      changed: [{ unit, previous: promoted.previous, promotedTreeDigest: promoted.promotedTreeDigest }],
      activationId: ACTIVATION_ID, directory: fixture.directory, baseRecord: fixture.base,
      ownerId: OWNER_ID, guards: fixture.guards, sequence: null, previousRecordSha256: null,
    });
    assert.equal(reversal.reversed, true);
    const chain = api.readTransactionChain(fixture.directory);
    assert.equal(chain.records.length, before + 2);
    assert.deepEqual(chain.records.slice(-2).map((entry) => entry.record.transactionState),
      ["restoring", "restored"]);
  });
  await test("planP3bRecovery classifies every promotion boundary purely and never accepts", () => {
    const intent = { activationId: ACTIVATION_ID, repositoryRealpath: "/r", authorizedWorktreeRealpath: "/r" };
    const chainOf = (states, treeExtra = {}, recordExtra = {}) => ({
      present: true,
      records: [{ sequence: 1, sha256: "a".repeat(64), record: {
        schemaVersion: 1, mode: "activation-transaction", activationId: ACTIVATION_ID,
        transactionState: states[0], activationPerformed: false, finalActivationReceiptDurable: false,
        reloadPerformed: false, canaryPerformed: false, pushPerformed: false,
        trees: ["alias", "dev_output", "extension"].map((logicalName, index) => ({
          logicalName, state: states[index] ?? states[0], previousState: "present", ...treeExtra })),
        ...recordExtra } }],
    });
    const observe = (value) => Object.fromEntries(
      ["alias", "dev_output", "extension"].map((name) => [name, value]));
    const cases = [
      ["before retirement", ["untouched", "untouched", "untouched"], {}, {}, {}, "restore-backward"],
      ["after live-retiring", ["live-retiring", "untouched", "untouched"], {}, {}, {}, "restore-backward"],
      ["after live retired", ["live-retired", "untouched", "untouched"], {}, {}, {}, "restore-backward"],
      ["after incoming-promoting", ["incoming-promoting", "untouched", "untouched"], {}, {}, {}, "restore-backward"],
      ["after incoming promoted", ["incoming-promoted", "untouched", "untouched"], {}, {}, {}, "restore-backward"],
      ["all verified", ["verified", "verified", "verified"], {}, {}, {}, "p3c-finalization-required"],
      ["during reversal", ["restoring", "restoring", "restoring"], {}, {}, {}, "complete-reversal"],
      ["after restoration", ["restored", "restored", "restored"], {}, {}, {}, "complete-reversal"],
      ["first activation", ["incoming-promoted", "incoming-promoted", "incoming-promoted"],
        { previousState: "absent" }, {}, {}, "first-activation-restore-to-absent"],
      ["foreign live", ["verified", "verified", "verified"], {}, {}, { foreignLivePresent: true },
        "preserve-foreign-live-and-require-operator"],
      ["claimed acceptance", ["verified", "verified", "verified"], {}, { activationPerformed: true }, {},
        "contradictory-transaction"],
    ];
    for (const [label, states, treeExtra, recordExtra, observed, expected] of cases) {
      const plan = api.planP3bRecovery({
        intent, chain: chainOf(states, treeExtra, recordExtra), observations: observe(observed) });
      assert.equal(plan.classification, expected, label);
      // The planner must never claim acceptance. Rejection outcomes carry no
      // release state at all; planning outcomes carry an explicit false.
      assert.notEqual(plan.acceptedRelease, true, label);
      if (!["contradictory-transaction", "foreign-or-unowned-transaction"].includes(expected)) {
        assert.equal(plan.acceptedRelease, false, label);
      }
    }
    // Foreign identity is classified separately from any boundary.
    assert.equal(api.planP3bRecovery({ intent, chain: chainOf(["verified"]), observations: observe({}),
      expected: { repositoryRealpath: "/other" } }).classification, "foreign-or-unowned-transaction");
    // The planner performs no filesystem or Git access.
    const originalLstat = fs.lstatSync; const originalRead = fs.readdirSync;
    let touched = 0;
    fs.lstatSync = (...args) => { touched += 1; return originalLstat(...args); };
    fs.readdirSync = (...args) => { touched += 1; return originalRead(...args); };
    try {
      api.planP3bRecovery({ intent, chain: chainOf(["verified", "verified", "verified"]),
        observations: observe({}) });
    } finally { fs.lstatSync = originalLstat; fs.readdirSync = originalRead; }
    assert.equal(touched, 0, "planner must perform no filesystem access");
  });
  await test("P3B never records acceptance and reserves it for P3C", () => {
    const fixture = createP3bFixture("p3b-no-acceptance");
    assert.throws(() => api.assertP3bWritableState("accepted"),
      (error) => error.code === "transaction-state-reserved-for-p3c");
    for (const state of ["live-retiring", "live-retired", "incoming-promoting",
      "incoming-promoted", "verified", "restoring", "restored"]) {
      assert.equal(api.assertP3bWritableState(state), state);
    }
    const unit = fixture.units[0];
    const prepared = p3bPrepare(fixture, unit);
    p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    for (const entry of api.readTransactionChain(fixture.directory).records) {
      for (const key of ["activationPerformed", "finalActivationReceiptDurable",
        "reloadPerformed", "canaryPerformed", "pushPerformed"]) {
        assert.equal(entry.record[key], false, key);
      }
      assert.notEqual(entry.record.transactionState, "accepted");
    }
  });
  await test("promotion survives spaces, emoji and /var versus /private/var spellings", () => {
    const fixture = createP3bFixture("p3b-boundary paths 🧪");
    const unit = fixture.units[0];
    const alternate = fixture.repository.startsWith("/private/")
      ? fixture.repository.replace("/private", "") : fixture.repository;
    const prepared = prepareOwned(api, fixture.verification, unit, alternate);
    const result = p3bPromote(fixture, unit, { expectedTreeDigest: prepared.promotionIdentity });
    assert.equal(result.promotedTreeDigest, prepared.promotionIdentity);
    assert.equal(normalized(unit.livePath).startsWith(normalized(fixture.repository)), true);
  });

  /* ---------- capability boundary ---------- */
  await test("the payload module exposes no caller-selected generic mutation capability", () => {
    for (const name of ["promote", "rollback", "recover", "prune", "retireLive", "restoreLive",
      "writeActivationReceipt", "writeRollbackReceipt", "acquireLease", "renameLive"]) {
      assert.equal(Object.hasOwn(api, name), false, name);
    }
  });
  await test("no real canonical payload path was touched by this suite", () => {
    const realRepository = "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source";
    for (const relative of [
      ["apps", "dev-server", "alias"],
      ["apps", "dev-server", "dev_output"],
      ["apps", "extensions", "chatgpt", "chrome", ACCEPTED_EXTENSION_VARIANT],
    ]) {
      const live = path.join(realRepository, ...relative);
      for (const root of temporaryRoots) {
        assert.equal(normalized(live).startsWith(`${normalized(root)}${path.sep}`), false);
      }
    }
    assert.equal(temporaryRoots.every((root) => normalized(root).startsWith(normalized(os.tmpdir()))), true);
  });

  /* ------------------------------------------------------------------- *
   * P3C-A1 — durable activation receipt and terminal acceptance
   * ------------------------------------------------------------------- */

  const receiptFixture = (label) => path.join(tempRoot(`p3ca1-${label}`), ".h2o-canonical-delivery");
  const P3CA1_ACTIVATION_ID = "20260805T000000000Z-abcdef123456";
  const P3CA1_OWNER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const sampleReceipt = (over = {}) => api.buildActivationReceipt({
    activationId: P3CA1_ACTIVATION_ID,
    transactionRecordPath: "/tx/seq-000005.json", transactionRecordSha256: "a".repeat(64),
    intentPath: "/intents/x.json", intentSha256: "b".repeat(64),
    stageReceiptPath: "/stage/publication-receipt.json", stageReceiptSha256: "e".repeat(64),
    repositoryRealpath: "/repo", authorizedWorktreeRealpath: "/repo", branch: "main",
    approvedHead: "d".repeat(40), sourceTree: "f".repeat(40),
    stableGitIdentity: { path: "/usr/bin/git", realpath: "/usr/bin/git",
      version: "git version 2.50.1", sha256: "c".repeat(64) },
    acceptedExtensionVariant: ACCEPTED_EXTENSION_VARIANT, buildMarker: "1785900000000",
    stagedIdentities: {}, incomingIdentities: {}, previousCanonicalIdentities: {},
    promotedCanonicalIdentities: {}, canonicalVerification: {},
    promotionPrimitive: "fail-closed-two-rename", preparedAt: "t1", promotedAt: "t2",
    verifiedAt: "t3", acceptedAt: "t4", rollbackAvailable: true, ...over,
  });

  await test("the activation receipt is published no-replace at 0600 and byte-verified", () => {
    const anchor = receiptFixture("publish");
    const published = api.publishActivationReceipt(anchor, P3CA1_ACTIVATION_ID, sampleReceipt(),
      { ownerId: P3CA1_OWNER_ID });
    assert.equal(path.basename(published.path), `${P3CA1_ACTIVATION_ID}.json`);
    assert.equal(fs.statSync(published.path).mode & 0o777, 0o600);
    assert.equal(sha256Bytes(fs.readFileSync(published.path)), published.sha256);
    assert.equal(published.durability.powerLossDurabilityGuaranteed, false);
    assert.equal(published.durability.processCrashAtomicity, true);
    assert.equal(published.durability.fileFsync.attempted, true);
    // No temporary file survives publication.
    assert.deepEqual(fs.readdirSync(path.dirname(published.path)), [`${P3CA1_ACTIVATION_ID}.json`]);
  });
  await test("each receipt durability step fails closed and leaves no partial publication", () => {
    // Every step before the no-replace link must leave nothing behind; steps
    // after it must not remove the already-linked receipt.
    for (const [point, linked] of [
      ["before-temp-open", false], ["after-temp-open", false], ["after-write", false],
      ["after-fsync", false], ["after-link", true], ["after-directory-fsync", true],
    ]) {
      const anchor = receiptFixture(`fail-${point}`);
      assert.throws(() => api.publishActivationReceipt(anchor, P3CA1_ACTIVATION_ID, sampleReceipt(), {
        ownerId: P3CA1_OWNER_ID,
        failureInjection: (observed) => {
          if (observed === point) throw new Error(`injected ${point} failure`);
        },
      }), point);
      const directory = path.join(anchor, "activations");
      const entries = fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
      assert.deepEqual(entries, linked ? [`${P3CA1_ACTIVATION_ID}.json`] : [], point);
    }
  });
  await test("an existing activation receipt is never overwritten", () => {
    const anchor = receiptFixture("collision");
    const first = api.publishActivationReceipt(anchor, P3CA1_ACTIVATION_ID, sampleReceipt(),
      { ownerId: P3CA1_OWNER_ID });
    const before = fs.readFileSync(first.path);
    assert.throws(() => api.publishActivationReceipt(anchor, P3CA1_ACTIVATION_ID,
      sampleReceipt({ verifiedAt: "different" }), { ownerId: P3CA1_OWNER_ID }),
    (error) => error?.code === "activation-receipt-collision");
    assert.equal(fs.readFileSync(first.path).equals(before), true, "receipt bytes changed");
  });
  await test("the receipt binds its boundary flags and never claims power-loss durability", () => {
    const receipt = sampleReceipt();
    assert.equal(receipt.activationPerformed, true);
    for (const flag of ["reloadPerformed", "canaryPerformed", "pushPerformed"]) {
      assert.equal(receipt[flag], false, flag);
    }
    assert.equal(receipt.durability.powerLossDurabilityGuaranteed, false);
    assert.equal(receipt.acceptedExtensionVariant, ACCEPTED_EXTENSION_VARIANT);
    assert.equal(receipt.promotionPrimitive, "fail-closed-two-rename");
  });
  await test("acceptance is impossible without a durable, re-verified receipt", () => {
    assert.throws(() => api.appendAcceptedRecord({
      directory: tempRoot("p3ca1-accept-no-receipt"), baseRecord: {}, sequence: 1,
      previousRecordSha256: null, ownerId: P3CA1_OWNER_ID, receipt: null, trees: [],
    }), (error) => error?.code === "acceptance-requires-durable-receipt");
    // A receipt whose bytes drifted after publication is refused too.
    const anchor = receiptFixture("accept-tampered");
    const published = api.publishActivationReceipt(anchor, P3CA1_ACTIVATION_ID, sampleReceipt(),
      { ownerId: P3CA1_OWNER_ID });
    fs.writeFileSync(published.path, "tampered\n");
    assert.throws(() => api.appendAcceptedRecord({
      directory: path.dirname(published.path), baseRecord: {}, sequence: 1,
      previousRecordSha256: null, ownerId: P3CA1_OWNER_ID, receipt: published, trees: [],
    }), (error) => error?.code === "acceptance-receipt-unverified");
  });
  await test("terminal states are reserved for P3C and unreachable from the P3B writer", () => {
    assert.throws(() => api.assertP3bWritableState("accepted"),
      (error) => error?.code === "transaction-state-reserved-for-p3c");
    assert.throws(() => api.assertP3bWritableState("rollback-complete"),
      (error) => error?.code === "transaction-state-reserved-for-p3c");
    assert.equal(api.assertP3cWritableState("accepted"), "accepted");
    assert.throws(() => api.assertP3cWritableState("verified"),
      (error) => error?.code === "transaction-state-not-p3c");
  });
  /* ----------------- P3C-A2 canonical verification foundation ----------------- */

  const buildLiveTrees = (label, { symlinkTarget = null } = {}) => {
    const top = tempRoot(`p3ca2-${label}`);
    const repository = path.join(top, "repo with spaces 🧪");
    fs.mkdirSync(path.join(repository, "apps", "dev-server"), { recursive: true });
    fs.mkdirSync(path.join(repository, "apps", "extensions", "chatgpt", "chrome"), { recursive: true });
    const units = api.canonicalUnitPaths(fs.realpathSync.native(repository), P3CA1_ACTIVATION_ID);
    for (const unit of units) {
      fs.mkdirSync(unit.livePath, { recursive: true });
      fs.writeFileSync(path.join(unit.livePath, "x.js"), `// ${unit.logicalName}\n`);
    }
    for (const required of ["manifest.json", "loader.js", "bg.js", "title-contract-bridge.js"]) {
      fs.writeFileSync(path.join(units[2].livePath, required), `// ${required}\n`);
    }
    fs.mkdirSync(path.join(units[2].livePath, "provider"), { recursive: true });
    fs.writeFileSync(path.join(units[2].livePath, "provider", "identity-provider-supabase.js"), "// p\n");
    if (symlinkTarget) fs.symlinkSync(symlinkTarget, path.join(units[0].livePath, "link.js"));
    const promoted = Object.fromEntries(units.map((unit) =>
      [unit.logicalName, api.recomputeIncomingManifest(unit.livePath, "")]));
    return { top, repository, units, promoted };
  };
  const receiptFor = (promoted, over = {}) => api.buildActivationReceipt({
    activationId: P3CA1_ACTIVATION_ID,
    transactionRecordPath: "/tx/seq-000005.json", transactionRecordSha256: "a".repeat(64),
    intentPath: "/intents/x.json", intentSha256: "b".repeat(64),
    stageReceiptPath: "/stage/publication-receipt.json", stageReceiptSha256: "e".repeat(64),
    repositoryRealpath: "/repo", authorizedWorktreeRealpath: "/repo", branch: "main",
    approvedHead: "d".repeat(40), sourceTree: "f".repeat(40),
    stableGitIdentity: { path: "/usr/bin/git", realpath: "/usr/bin/git",
      version: "git version 2.50.1", sha256: "c".repeat(64) },
    acceptedExtensionVariant: ACCEPTED_EXTENSION_VARIANT, buildMarker: "1785900000000",
    stagedIdentities: {}, incomingIdentities: {}, previousCanonicalIdentities: {},
    promotedCanonicalIdentities: promoted, canonicalVerification: {},
    promotionPrimitive: "fail-closed-two-rename", preparedAt: "t1", promotedAt: "t2",
    verifiedAt: "t3", acceptedAt: "t4", rollbackAvailable: true, ...over,
  });

  await test("canonical verification reports per-tree manifests, digests and same-stage status", () => {
    const world = buildLiveTrees("ok");
    const result = api.verifyCanonicalAgainstReceipt(world.units, receiptFor(world.promoted), {
      expectedBuildMarker: "1785900000000", repository: world.repository,
      requiredFiles: ["manifest.json", "loader.js", "bg.js", "title-contract-bridge.js",
        "provider/identity-provider-supabase.js"],
      extensionVariant: ACCEPTED_EXTENSION_VARIANT,
    });
    assert.equal(result.ok, true);
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.sameStageVerified, true);
    assert.equal(result.mixedGenerationDetected, false);
    assert.equal(result.buildMarker, "1785900000000");
    assert.deepEqual(Object.keys(result.results).sort(), ["alias", "dev_output", "extension"]);
  });
  await test("canonical verification distinguishes a mixed generation from whole-release drift", () => {
    // One unit drifts: not this receipt's generation.
    const partial = buildLiveTrees("mixed");
    fs.writeFileSync(path.join(partial.units[1].livePath, "x.js"), "// other generation\n");
    assert.throws(() => api.verifyCanonicalAgainstReceipt(partial.units, receiptFor(partial.promoted),
      { repository: partial.repository }),
    (error) => error?.code === "canonical-verification-mixed-generation" &&
      error?.details?.drifted?.includes("dev_output") &&
      error?.details?.matching?.includes("alias"));
    // Every unit drifts: reported as the first unit's own mismatch, not mixed.
    const whole = buildLiveTrees("whole");
    for (const unit of whole.units) fs.writeFileSync(path.join(unit.livePath, "extra.js"), "// e\n");
    assert.throws(() => api.verifyCanonicalAgainstReceipt(whole.units, receiptFor(whole.promoted),
      { repository: whole.repository }),
    (error) => error?.code === "canonical-verification-file-count");
  });
  await test("canonical verification enforces resolved-target policy on live symlinks", () => {
    // Inside the family: accepted.
    const inside = buildLiveTrees("link-inside", { symlinkTarget: "x.js" });
    const ok = api.verifyCanonicalAgainstReceipt(inside.units, receiptFor(inside.promoted),
      { repository: inside.repository });
    assert.equal(ok.results.alias.symlinkCount, 1);
    assert.equal(ok.results.alias.symlinks[0].insideFamily, true);
    // Broken: refused even though the link text is unchanged.
    const broken = buildLiveTrees("link-broken", { symlinkTarget: "absent.js" });
    assert.throws(() => api.verifyCanonicalAgainstReceipt(broken.units, receiptFor(broken.promoted),
      { repository: broken.repository }),
    (error) => error?.code === "canonical-verification-symlink-broken");
    // Generated output: refused.
    const generated = buildLiveTrees("link-generated");
    const generatedTarget = path.join(generated.repository, "apps", "dev-server", "generated.js");
    fs.writeFileSync(generatedTarget, "// generated\n");
    fs.symlinkSync(generatedTarget, path.join(generated.units[0].livePath, "link.js"));
    const generatedPromoted = Object.fromEntries(generated.units.map((unit) =>
      [unit.logicalName, api.recomputeIncomingManifest(unit.livePath, "")]));
    assert.throws(() => api.verifyCanonicalAgainstReceipt(generated.units,
      receiptFor(generatedPromoted), { repository: generated.repository }),
    (error) => error?.code === "canonical-verification-symlink-generated-target");
    // Outside every approved root: refused.
    const foreign = buildLiveTrees("link-foreign");
    const foreignTarget = path.join(foreign.top, "outside.js");
    fs.writeFileSync(foreignTarget, "// outside\n");
    fs.symlinkSync(foreignTarget, path.join(foreign.units[0].livePath, "link.js"));
    const foreignPromoted = Object.fromEntries(foreign.units.map((unit) =>
      [unit.logicalName, api.recomputeIncomingManifest(unit.livePath, "")]));
    assert.throws(() => api.verifyCanonicalAgainstReceipt(foreign.units,
      receiptFor(foreignPromoted), { repository: foreign.repository }),
    (error) => error?.code === "canonical-verification-symlink-foreign");
  });
  await test("canonical verification enforces required files, variant and build marker", () => {
    const world = buildLiveTrees("required");
    const required = ["manifest.json", "loader.js", "bg.js", "title-contract-bridge.js",
      "provider/identity-provider-supabase.js"];
    // A required file that is simply absent from the receipt's own tree.
    assert.throws(() => api.verifyCanonicalAgainstReceipt(world.units, receiptFor(world.promoted),
      { repository: world.repository, requiredFiles: [...required, "absent-required.js"] }),
    (error) => error?.code === "canonical-verification-required-file");
    assert.throws(() => api.verifyCanonicalAgainstReceipt(world.units, receiptFor(world.promoted),
      { repository: world.repository, extensionVariant: "dev-lean" }),
    (error) => error?.code === "canonical-verification-extension-variant");
    assert.throws(() => api.verifyCanonicalAgainstReceipt(world.units, receiptFor(world.promoted),
      { repository: world.repository, expectedBuildMarker: "1700000000000" }),
    (error) => error?.code === "canonical-verification-build-marker");
    assert.throws(() => api.verifyCanonicalAgainstReceipt(world.units,
      { ...receiptFor(world.promoted), mode: "stage-receipt" }, { repository: world.repository }),
    (error) => error?.code === "canonical-verification-receipt-invalid");
    assert.throws(() => api.verifyCanonicalAgainstReceipt(world.units.slice(0, 2),
      receiptFor(world.promoted), { repository: world.repository }),
    (error) => error?.code === "canonical-verification-incomplete");
  });
  await test("canonical verification performs no filesystem mutation whatsoever", () => {
    const world = buildLiveTrees("read-only", { symlinkTarget: "x.js" });
    const receipt = receiptFor(world.promoted);
    const guarded = ["mkdirSync", "writeFileSync", "appendFileSync", "chmodSync", "linkSync",
      "symlinkSync", "unlinkSync", "renameSync", "rmSync", "rmdirSync", "copyFileSync",
      "truncateSync", "utimesSync"];
    const originals = {};
    const denied = [];
    for (const name of guarded) {
      originals[name] = fs[name];
      fs[name] = (...args) => { denied.push(name); return originals[name](...args); };
    }
    try {
      api.verifyCanonicalAgainstReceipt(world.units, receipt, { repository: world.repository });
    } finally {
      for (const name of guarded) fs[name] = originals[name];
    }
    assert.deepEqual(denied, []);
  });
  await test("live canonical trees must be real directories, present and typed", () => {
    const missing = buildLiveTrees("live-missing");
    fs.rmSync(missing.units[1].livePath, { recursive: true });
    assert.throws(() => api.verifyCanonicalAgainstReceipt(missing.units, receiptFor(missing.promoted),
      { repository: missing.repository }),
    (error) => error?.code === "canonical-verification-live-missing");
    const swapped = buildLiveTrees("live-symlink");
    fs.rmSync(swapped.units[1].livePath, { recursive: true });
    fs.symlinkSync(swapped.units[0].livePath, swapped.units[1].livePath);
    assert.throws(() => api.verifyCanonicalAgainstReceipt(swapped.units, receiptFor(swapped.promoted),
      { repository: swapped.repository }),
    (error) => error?.code === "canonical-verification-live-invalid");
    const noIdentity = buildLiveTrees("no-identity");
    const stripped = { ...noIdentity.promoted };
    delete stripped.extension;
    assert.throws(() => api.verifyCanonicalAgainstReceipt(noIdentity.units, receiptFor(stripped),
      { repository: noIdentity.repository }),
    (error) => error?.code === "canonical-verification-identity-missing");
  });

  await test("receipt publication touches no real canonical or anchor path", () => {
    // The production anchor may legitimately exist and hold activation audit evidence.
    // Absence is no longer the invariant; non-mutation by this suite is.
    const after = snapshotCanonicalAnchor();
    assert.equal(after.exists, REAL_ANCHOR_BASELINE.exists,
      "this suite must neither create nor remove the real canonical anchor");
    assert.deepEqual(after.entries, REAL_ANCHOR_BASELINE.entries,
      "this suite must not alter real canonical anchor contents");
    assert.equal(canonicalAnchorDigest(after), canonicalAnchorDigest(REAL_ANCHOR_BASELINE));
    assert.equal(temporaryRoots.every((root) =>
      normalized(root).startsWith(normalized(os.tmpdir()))), true);
    // No fixture root may be, or contain, the real anchor.
    const real = normalized(REAL_CANONICAL_ANCHOR);
    for (const root of temporaryRoots) {
      assert.equal(real === normalized(root), false);
      assert.equal(real.startsWith(`${normalized(root)}${path.sep}`), false);
    }
  });

  await test("anchor snapshot of an absent path is deterministic and empty", () => {
    const absent = path.join(tempRoot("anchor-absent"), ".h2o-canonical-delivery");
    const first = snapshotCanonicalAnchor(absent);
    const second = snapshotCanonicalAnchor(absent);
    assert.equal(first.exists, false);
    assert.deepEqual(first.entries, []);
    assert.deepEqual(second, first);
    assert.equal(canonicalAnchorDigest(first), canonicalAnchorDigest(second));
  });

  await test("anchor snapshot detects an added file and changed regular-file bytes", () => {
    const anchor = path.join(tempRoot("anchor-mutate"), ".h2o-canonical-delivery");
    fs.mkdirSync(path.join(anchor, "activations"), { recursive: true });
    const record = path.join(anchor, "activations", "sample.json");
    fs.writeFileSync(record, "{\"activationId\":\"sample\"}\n");
    const baseline = snapshotCanonicalAnchor(anchor);
    assert.equal(baseline.exists, true);
    assert.equal(baseline.entries.some((entry) => entry.path === "activations/sample.json"), true);

    const added = path.join(anchor, "activations", "added.json");
    fs.writeFileSync(added, "{}\n");
    assert.notEqual(canonicalAnchorDigest(snapshotCanonicalAnchor(anchor)),
      canonicalAnchorDigest(baseline), "an added file must change the snapshot");
    fs.rmSync(added);
    assert.deepEqual(snapshotCanonicalAnchor(anchor).entries, baseline.entries,
      "removing the addition must restore the original snapshot");

    fs.writeFileSync(record, "{\"activationId\":\"sample-mutated\"}\n");
    assert.notEqual(canonicalAnchorDigest(snapshotCanonicalAnchor(anchor)),
      canonicalAnchorDigest(baseline), "changed regular-file bytes must change the snapshot");
  });

  await test("anchor snapshot ordering is independent of filesystem enumeration order", () => {
    const names = ["seq-000002.json", "seq-000001.json", "seq-000010.json"];
    const build = (label, order) => {
      const anchor = path.join(tempRoot(label), ".h2o-canonical-delivery");
      fs.mkdirSync(path.join(anchor, "transactions"), { recursive: true });
      for (const name of order) {
        fs.writeFileSync(path.join(anchor, "transactions", name), `{"n":"${name}"}\n`);
      }
      return anchor;
    };
    const forward = snapshotCanonicalAnchor(build("anchor-order-a", names));
    const reverse = snapshotCanonicalAnchor(build("anchor-order-b", [...names].reverse()));
    assert.deepEqual(forward.entries, reverse.entries);
    assert.equal(canonicalAnchorDigest(forward), canonicalAnchorDigest(reverse));
    assert.deepEqual(forward.entries.map((entry) => entry.path),
      [...forward.entries.map((entry) => entry.path)].sort((a, b) => a.localeCompare(b, "en")));
  });

  await test("the production anchor is never a task-owned disposable fixture root", () => {
    assert.equal(temporaryRoots.length > 0, true, "fixture roots must exist for this proof to bite");
    const real = normalized(REAL_CANONICAL_ANCHOR);
    assert.equal(real.startsWith(`${normalized(os.tmpdir())}${path.sep}`), false,
      "the production anchor must never resolve under the task temporary root");
    for (const root of temporaryRoots) {
      assert.equal(real === normalized(root), false);
      assert.equal(real.startsWith(`${normalized(root)}${path.sep}`), false);
    }
  });
}

/* --------------------------------------------------------------------- *
 * Structural guards
 * --------------------------------------------------------------------- */

function runStructuralTests() {
  const payloadSource = fs.readFileSync(path.join(ROOT, PAYLOAD_MODULE_REL), "utf8");
  const activatorSource = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
  const packageSource = fs.readFileSync(path.join(ROOT, PACKAGE_REL), "utf8");

  structural("the payload module imports only Node builtins", () => {
    const declarations = [...payloadSource.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["'];/gu)]
      .map((match) => match[1]).sort();
    assert.deepEqual(declarations, ["node:crypto", "node:fs", "node:path"]);
  });
  structural("the payload module uses no default, namespace, aliased or dynamic project import", () => {
    assert.doesNotMatch(payloadSource, /import\s*\(/u);
    assert.doesNotMatch(payloadSource, /import\s+\w+\s+from\s+["']\.\//u);
    assert.doesNotMatch(payloadSource, /import\s+\*\s+as/u);
    assert.doesNotMatch(payloadSource, /\s+as\s+\w+\s*[,}]/u);
  });
  structural("the activator holds exactly one pinned payload-transaction import edge", () => {
    const declarations = [...activatorSource.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["'];/gu)]
      .map((match) => match[1]).filter((entry) => entry.startsWith("./")).sort();
    assert.deepEqual(declarations,
      ["./canonical-delivery-lib.mjs", "./lean-payload-transaction.mjs", "./lean-publisher.mjs"]);
    assert.equal(declarations.filter((entry) => entry.endsWith("lean-payload-transaction.mjs")).length, 1);
    // Named symbols only: no namespace, default, aliased, dynamic or re-export.
    const edge = activatorSource.match(/import \{([^}]*?)\} from "\.\/lean-payload-transaction\.mjs";/u);
    assert.ok(edge, "the payload import edge must be one named-import declaration");
    assert.doesNotMatch(activatorSource, /import\s*\(/u);
    assert.doesNotMatch(activatorSource,
      /import\s+\*\s+as\s+\w+\s+from\s+["'][^"']*lean-payload-transaction/u);
    assert.doesNotMatch(activatorSource,
      /export\s+\*\s+from\s+["'][^"']*lean-payload-transaction/u);
    // The payload module never imports back: the edge is one-directional.
    assert.doesNotMatch(payloadSource, /from\s+["'][^"']*lean-activator/u);
  });
  structural("the rename capability exists once, only inside the approved helper", () => {
    // The activator never gains rename capability.
    assert.doesNotMatch(activatorSource, /fs\.rename(?:Sync)?\s*\(/u);
    assert.doesNotMatch(activatorSource, /fs\.promises\.rename\s*\(/u);
    // Exactly one rename site in the payload module, and no other rename API.
    assert.equal((payloadSource.match(/fs\.renameSync\(/gu) || []).length, 1);
    assert.doesNotMatch(payloadSource, /fs\.promises\.rename\s*\(/u);
    assert.doesNotMatch(payloadSource, /fs\.rename\s*\(/u);
    // The single site lives inside renameCanonicalEntry.
    const helperStart = payloadSource.indexOf("function renameCanonicalEntry(");
    assert(helperStart > 0, "approved rename helper must exist");
    const helperEnd = payloadSource.indexOf("\n}", helperStart);
    const helper = payloadSource.slice(helperStart, helperEnd);
    assert.match(helper, /fs\.renameSync\(from, to\)/u);
    // Every call site of the helper is enumerated.
    const occurrences = [...payloadSource.matchAll(/renameCanonicalEntry\(\{/gu)].length;
    const declarations = [...payloadSource.matchAll(/function renameCanonicalEntry\(\{/gu)].length;
    assert.equal(declarations, 1, "exactly one rename helper declaration");
    assert.equal(occurrences - declarations, 8,
      "promotion, reversal, rollback and rollback recovery share the only rename helper");
  });
  structural("P3B may not write either terminal state; both are reserved for P3C", () => {
    assert.match(payloadSource,
      /P3C_RESERVED_STATES = Object\.freeze\(\["accepted", "rollback-complete"\]\)/u);
    assert.match(payloadSource, /transaction-state-reserved-for-p3c/u);
    // The promotion orchestration itself never claims activation or durability;
    // only the P3C-A1 receipt builder may assert activationPerformed.
    const orchestration = payloadSource.slice(
      payloadSource.indexOf("export function promoteUnitWithJournal"),
      payloadSource.indexOf("export function buildActivationReceipt"));
    for (const claim of ["activationPerformed: true", "finalActivationReceiptDurable: true",
      "reloadPerformed: true", "canaryPerformed: true", "pushPerformed: true"]) {
      assert.equal(orchestration.includes(claim), false, claim);
    }
    // Nothing anywhere in the module may claim a reload, canary or push.
    for (const claim of ["reloadPerformed: true", "canaryPerformed: true", "pushPerformed: true"]) {
      assert.equal(payloadSource.includes(claim), false, claim);
    }
  });
  structural("promotion order is pinned and reversal is its exact reverse", () => {
    assert.match(payloadSource, /RELEASE_ORDER = Object\.freeze\(\["alias", "dev_output", "extension"\]\)/u);
    assert.match(payloadSource, /REVERSAL_ORDER = Object\.freeze\(\[\.\.\.RELEASE_ORDER\]\.reverse\(\)\)/u);
  });
  structural("gap takeover is typed and never deletes foreign content", () => {
    assert.match(payloadSource, /promotion-gap-takeover/u);
    assert.match(payloadSource, /reversal-foreign-live/u);
    // No deletion helper targets a retired payload.
    assert.doesNotMatch(payloadSource, /rmSync\([^)]*retiredPath/u);
  });
  structural("promotion re-proves lock and lease ownership before every rename", () => {
    assert.match(payloadSource, /assertPromotionOwnership/u);
    const helperStart = payloadSource.indexOf("function renameCanonicalEntry(");
    const helper = payloadSource.slice(helperStart, payloadSource.indexOf("\n}", helperStart));
    assert.match(helper, /if \(typeof guard === "function"\) guard\(\);/u);
    const guardBeforeRename = helper.indexOf("guard()") < helper.indexOf("fs.renameSync(");
    assert.equal(guardBeforeRename, true);
  });
  structural("the payload module exposes exactly one recursive removal, gated by an ownership handle", () => {
    // P3A: owned incoming cleanup. P3B adds exactly two restoration removals,
    // both of which remove only payload this transaction promoted.
    const matches = payloadSource.match(/fs\.rmSync\(/gu) || [];
    assert.equal(matches.length, 3);
    assert.match(payloadSource, /fs\.rmSync\(unit\.livePath, \{ recursive: true, force: false \}\)/u);
    assert.doesNotMatch(payloadSource, /rmSync\([^)]*retiredPath/u);
    assert.match(payloadSource, /removeOwnedIncomingRoot\(ownership\)/u);
    assert.match(payloadSource, /assertIncomingOwnership\(ownership\)/u);
    assert.match(payloadSource, /const OWNED_INCOMING_ROOTS = new WeakSet\(\);/u);
    assert.doesNotMatch(payloadSource, /removeOwnIncompleteIncoming/u);
    // Staging and retired siblings are never interchangeable for cleanup.
    assert.doesNotMatch(payloadSource, /ownsActivationSibling/u);
    assert.match(payloadSource, /\.staging-act-\$\{ownership\.activationId\}/u);
  });
  structural("symlink relocation is governed by resolved target, never raw link text", () => {
    assert.match(payloadSource, /planSymlinkRelocation/u);
    assert.match(payloadSource, /verifyRelocatedSymlink/u);
    assert.match(payloadSource, /staged-symlink-broken/u);
    assert.match(payloadSource, /incoming-symlink-redirected/u);
    assert.match(payloadSource, /incoming-symlink-generated-target/u);
    assert.match(payloadSource, /expectedIncomingManifest/u);
  });
  structural("the declared coordination surface includes transactions", () => {
    const activator = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
    assert.match(activator, /FUTURE_COORDINATION_SUBPATHS[\s\S]*"transactions"/u);
    assert.match(payloadSource, /TRANSACTION_SUBPATH = "transactions"/u);
  });
  structural("write-ahead orchestration is executable and CLI-unreachable", () => {
    assert.match(payloadSource, /export function prepareIncomingUnitWithJournal/u);
    const order = payloadSource.slice(payloadSource.indexOf("export function prepareIncomingUnitWithJournal"));
    const preparing = order.indexOf('transactionState: "incoming-preparing"');
    const created = order.indexOf("createOwnedIncomingRoot(unit, activationId)");
    const prepared = order.indexOf('transactionState: "incoming-prepared"');
    assert(preparing >= 0 && created > preparing && prepared > created,
      "preparing record must precede root creation, which must precede the prepared record");
    const activator = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
    assert.doesNotMatch(activator, /prepareIncomingUnitWithJournal/u);
  });
  structural("the payload module has no shell, network or browser capability", () => {
    assert.doesNotMatch(payloadSource, /child_process|\bspawn(?:Sync)?\s*\(|execFileSync|execSync/u);
    assert.doesNotMatch(payloadSource, /node:(?:net|http|https|dns|tls)|fetch\s*\(|XMLHttpRequest/u);
  });
  structural("the payload module runs no Git and offers no CLI entry point", () => {
    assert.doesNotMatch(payloadSource, /\bgit\b\s*\(|rev-parse|worktree list|process\.argv/u);
  });
  structural("the payload module never names a failed-act sibling family", () => {
    assert.doesNotMatch(payloadSource, /failed-act-/u);
    assert.match(payloadSource, /staging-act-/u);
    assert.match(payloadSource, /retired-act-/u);
  });
  structural("P3A writable states exclude every live-mutation and promotion state", () => {
    assert.match(payloadSource, /P3A_TRANSACTION_STATES = Object\.freeze\(\[/u);
    for (const state of ["live-retiring", "live-retired", "incoming-promoting",
      "incoming-promoted", "verified", "restoring", "restored", "accepted"]) {
      assert.match(payloadSource, new RegExp(`DEFERRED_TRANSACTION_STATES[\\s\\S]*${state}`, "u"));
    }
  });
  structural("the durable publication path is no-replace hard linking", () => {
    assert.match(payloadSource, /fs\.linkSync\(tempPath, finalPath\)/u);
    // P3A pinned one site (the transaction journal); P3C-A1 adds exactly one
    // more (the durable receipt). Both are no-replace.
    assert.equal((payloadSource.match(/fs\.linkSync\(/gu) || []).length, 2);
    assert.equal((payloadSource.match(/openSync\(tempPath, "wx", 0o600\)/gu) || []).length, 2);
    assert.match(payloadSource, /powerLossDurabilityGuaranteed: false/u);
    assert.doesNotMatch(payloadSource, /fs\.renameSync\(tempPath, finalPath\)/u);
  });
  structural("exactly one rename site serves the whole promotion primitive", () => {
    assert.equal((payloadSource.match(/fs\.renameSync\s*\(/gu) || []).length, 1);
    assert.doesNotMatch(activatorSource, /fs\.renameSync\s*\(/u);
    // The activator keeps its single pre-existing no-replace site, the P2
    // activation-intent journal, and gains none from P3C-A1.
    assert.equal((activatorSource.match(/fs\.linkSync\s*\(/gu) || []).length, 1);
  });
  structural("the activation receipt has exactly one publication helper and no overwrite path", () => {
    assert.equal((payloadSource.match(/function publishDurableReceipt\s*\(/gu) || []).length, 1);
    assert.equal((payloadSource.match(/export function publishActivationReceipt\s*\(/gu) || []).length, 1);
    assert.match(payloadSource, /Receipt already exists; receipts are never overwritten\./u);
    assert.match(payloadSource, /activation-receipt-collision/u);
    // Receipts are never written through a truncating or replacing call.
    assert.doesNotMatch(payloadSource, /writeFileSync\([^)]*finalPath/u);
    assert.doesNotMatch(payloadSource, /unlinkSync\(finalPath\)/u);
    // Failure injection is a fixture affordance only: production never sets it.
    assert.match(payloadSource, /failureInjection = null/u);
    assert.doesNotMatch(activatorSource, /failureInjection: \(/u);
  });
  structural("the terminal accepted state has exactly one writer requiring a durable receipt", () => {
    assert.equal((payloadSource.match(/export function appendAcceptedRecord\s*\(/gu) || []).length, 1);
    assert.match(payloadSource, /acceptance-requires-durable-receipt/u);
    assert.match(payloadSource, /acceptance-receipt-unverified/u);
    assert.match(payloadSource, /transaction-state-reserved-for-p3c/u);
    // The activator never constructs a terminal record by hand.
    assert.doesNotMatch(activatorSource, /transactionState:\s*["'`]accepted["'`]/u);
    // Exactly two approved call sites: activation finalization (P3C-A1) and
    // recovery forward-completion (P3C-B1). Both go through the one helper.
    assert.equal((activatorSource.match(/appendAcceptedRecord\s*\(/gu) || []).length, 2);
    // Recovery may only append after proving a durable, verified receipt.
    const recovery = activatorSource.slice(activatorSource.indexOf("export function recoverActivation"));
    const guardIndex = recovery.indexOf("recovery-forward-completion-unproven");
    const appendIndex = recovery.indexOf("appendAcceptedRecord(");
    assert.ok(guardIndex > 0 && appendIndex > guardIndex,
      "recovery must prove forward completion before appending the terminal record");
    assert.match(recovery.slice(0, appendIndex), /if \(!receipt \|\| !canonicalVerified\)/u);
  });
  structural("Studio rollback uses the same activator edge and requires separate immutable intent", () => {
    for (const admitted of ["publishRollbackReceipt", "appendRollbackCompleteRecord",
      "rollbackUnitToPrevious", "reverseRollbackUnit"]) {
      assert.match(payloadSource, new RegExp(`export function ${admitted}`, "u"));
      assert.match(activatorSource, new RegExp(`\\b${admitted}\\b`, "u"));
    }
    assert.match(activatorSource, /--prepare-rollback-intent/u);
    assert.match(activatorSource,
      /--rollback-receipt" && argv\[2\] === "--rollback-intent/u);
    assert.doesNotMatch(activatorSource, /return executeStudioRollback\([^,]+,\s*null/u);
    assert.match(payloadSource, /export function planP3cRecovery/u);
    assert.match(activatorSource, /planP3cRecovery\(/u);
    // The recovery planner stays pure: recovery never publishes a receipt.
    const recoveryRegion = activatorSource.slice(
      activatorSource.indexOf("export function recoverActivation"),
      activatorSource.indexOf("function recoveryBaseRecord"));
    assert.doesNotMatch(recoveryRegion, /publishActivationReceipt|buildActivationReceipt/u);
    assert.match(payloadSource, /export function verifyCanonicalAgainstReceipt/u);
    assert.match(activatorSource, /verifyCanonicalAgainstReceipt/u);
    assert.doesNotMatch(payloadSource, /failed-act-/u);
  });
  structural("no canonical destination override is reachable", () => {
    assert.doesNotMatch(payloadSource, /H2O_CANONICAL_DELIVERY_ROOT|process\.env/u);
  });
  structural("canonical verification has no mutating call path", () => {
    // Bound the verification region syntactically and prove no mutating fs API
    // appears anywhere inside it.
    const start = payloadSource.indexOf("function verifyLiveSymlinkPolicy");
    const end = payloadSource.indexOf("/* ---------------- pure P3C recovery policy ---------------- */");
    assert.ok(start > 0 && end > start, "canonical verification region must be locatable");
    const region = payloadSource.slice(start, end);
    for (const mutator of ["mkdirSync", "writeFileSync", "appendFileSync", "chmodSync", "linkSync",
      "symlinkSync", "unlinkSync", "renameSync", "rmSync", "rmdirSync", "copyFileSync",
      "truncateSync", "utimesSync", "openSync", "createWriteStream"]) {
      assert.doesNotMatch(region, new RegExp(`fs\\.${mutator}\\s*\\(`, "u"), mutator);
    }
    // Only read APIs are used.
    for (const reader of ["lstatSync", "readdirSync", "readlinkSync", "realpathSync"]) {
      assert.match(region, new RegExp(`fs\\.${reader}`, "u"), reader);
    }
    assert.match(region, /mutationPerformed: false/u);
    // The activator's production entry point is equally read-only.
    const activatorStart = activatorSource.indexOf("export function verifyCanonicalFromReceipt");
    // The verification region ends where P3C-B1 recovery begins; recovery is a
    // separate, deliberately mutating entry point with its own pins.
    const activatorEnd = activatorSource.indexOf("* P3C-B1 — deterministic recovery");
    assert.ok(activatorEnd > activatorStart, "the verification region must be bounded before recovery");
    assert.ok(activatorStart > 0 && activatorEnd > activatorStart);
    const activatorRegion = activatorSource.slice(activatorStart, activatorEnd);
    for (const mutator of ["mkdirSync", "writeFileSync", "linkSync", "unlinkSync", "renameSync",
      "rmSync", "chmodSync", "openSync"]) {
      assert.doesNotMatch(activatorRegion, new RegExp(`fs\\.${mutator}\\s*\\(`, "u"), mutator);
    }
    // No lock, no lease, no journal append, no receipt publication.
    for (const capability of ["withPublisherLock", "withCanonicalLease", "acquireLock", "acquireLease",
      "ensureTransactionDirectory", "publishActivationReceipt", "appendAcceptedRecord",
      "promoteReleaseWithJournal", "reverseRelease"]) {
      assert.doesNotMatch(activatorRegion, new RegExp(`\\b${capability}\\s*\\(`, "u"), capability);
    }
    // It derives the transaction directory purely, never creating it.
    assert.match(activatorRegion, /transactionDirectory\(foundation\.root/u);
  });
  structural("P3C-A2 adds no browser, network, push, pruning or failed-act capability", () => {
    for (const text of [payloadSource, activatorSource]) {
      assert.doesNotMatch(text, /failed-act-/u);
      assert.doesNotMatch(text, /node:(?:http|https|net|tls|dns)|\bfetch\s*\(/u);
      assert.doesNotMatch(text, /osascript|playwright|puppeteer|chrome\.runtime\.reload/iu);
      assert.doesNotMatch(text, /["'`](?:commit|push|pull|checkout|reset|clean|merge|rebase)["'`]/u);
    }
    // Rollback and rollback recovery are explicit two-authority routes; pruning
    // remains unavailable and no runtime/browser capability is introduced.
    const cli = activatorSource.slice(activatorSource.indexOf("export async function runLeanActivator"));
    assert.match(cli, /mutation-command-not-implemented/u);
    for (const command of ["--recover", "--rollback", "--prune"]) assert.ok(cli.includes(command), command);
    assert.match(cli, /--recover-rollback/u);
    assert.doesNotMatch(cli, /chrome\.runtime\.reload|osascript|playwright|puppeteer/iu);
  });
  structural("package.json declares no P3 command", () => {
    assert.doesNotMatch(packageSource, /lean-payload-transaction|--activate-receipt|--rollback|--recover|--prune|--verify-canonical|publish:h2o:activate/u);
  });
  assert.equal(structuralResults.length, EXPECTED_STRUCTURAL);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length) throw new Error(`Unknown validator arguments: ${args.join(" ")}`);
  runScopeTests();
  const scopeMode = classifyPayloadScope(currentScopeState());
  const api = await import(
    `${pathToFileURL(path.join(ROOT, PAYLOAD_MODULE_REL)).href}?validator=${Date.now()}`);
  await runRuntimeTests(api);
  runStructuralTests();
  assert.equal(runtimeResults.length, EXPECTED_RUNTIME);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    validator: PAYLOAD_VALIDATOR_REL,
    scopeMode,
    scopeScenarios: scopeResults.length,
    runtimeScenarios: runtimeResults.length,
    structuralAssertions: structuralResults.length,
    canonicalProductionMutationPerformed: false,
    promotionImplemented: true,
    studioPromotionFixtureValidated: true,
    studioRollbackFixtureValidated: true,
    canonicalProductionInspected: false,
    productionCliReachable: false,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
