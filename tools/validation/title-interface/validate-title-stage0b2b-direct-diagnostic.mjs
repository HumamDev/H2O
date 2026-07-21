#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  TITLE_DIAGNOSTIC_CONSTANTS as C,
  TITLE_DIAGNOSTIC_FILES,
  isTitleDiagnosticBuildEnabled,
  makeTitleNavigationDiagnosticIsolatedJs,
  makeTitleNavigationDiagnosticMainJs,
  makeTitleNavigationDiagnosticPopupJs,
  makeTitleNavigationDiagnosticServiceWorkerJs,
} from "../../product/extensions/chatgpt/chrome/title-diagnostic/chrome-live-title-navigation-diagnostic.mjs";
import { makeChromeLiveManifest } from "../../product/extensions/chatgpt/chrome/chrome-live-manifest.mjs";
import { getExtensionId, getExtensionKey } from "../../product/extensions/chatgpt/chrome/chrome-extension-keys.mjs";
import { makeChromeLivePopupHtml } from "../../product/extensions/chatgpt/chrome/popup/chrome-live-popup-html.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GENERATED = process.argv.includes("--generated");
const EXPECTED_ID = "ogcjkeaiicglflamhjaaimdhphjlgkbb";
const TARGET_VARIANT = "dev-controls-oauth-google";
const OUT = path.join(ROOT, "apps/extensions/chatgpt/chrome/dev-controls-oauth-google");
const PROXY = path.join(ROOT, "apps/dev-server/dev_output/proxy/_paste-pack.ext.txt");
const ALLOWED_TRACKED = new Set([
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs",
  "tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs",
  "tools/product/extensions/chatgpt/chrome/popup/chrome-live-popup-html.mjs",
  "tools/product/extensions/chatgpt/chrome/title-diagnostic/chrome-live-title-navigation-diagnostic.mjs",
  "tools/validation/title-interface/validate-title-stage0b2b-direct-diagnostic.mjs",
]);
const TITLE_PREFIXES = ["9B0a", "9B1a", "9C1a", "9D1a"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function syntax(source, label) {
  const result = spawnSync(process.execPath, ["--check", "-"], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, `${label} syntax failed: ${result.stderr}`);
}

function exactlyOneTitle(prefix) {
  const names = fs.readdirSync(path.join(ROOT, "src-runtime-base")).filter((name) => name.startsWith(prefix));
  assert.equal(names.length, 1, `${prefix} must resolve to exactly one source file`);
  return path.join("src-runtime-base", names[0]);
}

function assertFileScope() {
  const tracked = run("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--"])
    .split("\n").filter(Boolean);
  for (const relative of tracked) assert(ALLOWED_TRACKED.has(relative), `out-of-scope tracked diff: ${relative}`);
  const staged = run("git", ["diff", "--cached", "--name-only", "--"]);
  assert.equal(staged.trim(), "", "staged files are forbidden");
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard", "--"])
    .split("\n").filter(Boolean);
  for (const relative of untracked) {
    assert(relative.startsWith("chrome/") || ALLOWED_TRACKED.has(relative), `out-of-scope untracked path: ${relative}`);
  }
}

function assertTitleState() {
  for (const prefix of TITLE_PREFIXES) {
    const relative = exactlyOneTitle(prefix);
    const worktreeBlob = run("git", ["hash-object", "--no-filters", "--", relative]).trim();
    const headBlob = run("git", ["rev-parse", `HEAD:${relative}`]).trim();
    assert.equal(worktreeBlob, headBlob, `${relative} differs from HEAD`);
    syntax(read(relative), relative);
  }
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "config/dev-order.tsv"]).trim(), "", "dev-order.tsv changed");
  const order = read("config/dev-order.tsv");
  for (const prefix of ["9B0a", "9B1a", "9C1a"]) assert(new RegExp(`^🟢\\t${prefix}\\.`, "m").test(order), `${prefix} must remain enabled`);
  assert(/^🔴\t9D1a\./m.test(order), "9D1a must remain disabled");
}

function manifestFor(enabled, options = {}) {
  return makeChromeLiveManifest({
    PROXY_PACK_URL: "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt",
    CHAT_MATCH: "https://chatgpt.com/*",
    PAGE_FOLDER_BRIDGE_FILE: "folder-bridge-page.js",
    PAGE_PILOT_OBSERVER_FILE: "pilot-observer-page.js",
    DEV_HAS_CONTROLS: options.controls !== false,
    DEV_TITLE: "H2O Dev Controls",
    DEV_ACTION_TITLE: "H2O Dev Controls",
    DEV_NAME: "H2O Dev Controls (Unpacked)",
    DEV_VERSION: "1.3.0",
    DEV_DESCRIPTION: "validation",
    MANIFEST_PROFILE: options.production ? "production" : "development",
    IDENTITY_PROVIDER_REQUEST_OTP_ARMED: options.armed === true,
    IDENTITY_PROVIDER_OAUTH_PROVIDER: options.oauth ? "google" : null,
    TITLE_DIAGNOSTIC_ENABLED: enabled,
    STUDIO_ONLY: options.studio === true,
    EXTENSION_KEY: getExtensionKey(TARGET_VARIANT),
  });
}

function assertVariantIsolation() {
  const variants = ["production", "dev-lean", "studio-launcher", "dev-controls", "dev-controls-armed", TARGET_VARIANT];
  for (const variant of variants) {
    for (const envValue of [undefined, "0", "1"]) {
      const enabled = isTitleDiagnosticBuildEnabled({ envValue, outVariant: variant });
      assert.equal(enabled, envValue === "1" && variant === TARGET_VARIANT, `bad gate for ${variant}/${envValue}`);
    }
  }
  const profiles = {
    production: { controls: false, production: true },
    "dev-lean": { controls: false },
    "studio-launcher": { controls: false, production: true, studio: true },
    "dev-controls": {},
    "dev-controls-armed": { armed: true },
    [TARGET_VARIANT]: { armed: true, oauth: true },
  };
  for (const variant of variants) {
    const enabled = isTitleDiagnosticBuildEnabled({ envValue: "1", outVariant: variant });
    const generatedManifest = manifestFor(enabled, profiles[variant]);
    const hasDiagnosticPermissions = generatedManifest.permissions.includes("webNavigation") || generatedManifest.permissions.includes("scripting");
    assert.equal(hasDiagnosticPermissions, variant === TARGET_VARIANT, `manifest diagnostic leakage for ${variant}`);
    const generatedPopup = makeChromeLivePopupHtml({ titleDiagnosticEnabled: enabled });
    assert.equal(generatedPopup.includes("Title navigation diagnostic"), variant === TARGET_VARIANT, `popup diagnostic leakage for ${variant}`);
  }
  const off = manifestFor(false, profiles[TARGET_VARIANT]);
  const on = manifestFor(true, profiles[TARGET_VARIANT]);
  const delta = on.permissions.filter((permission) => !off.permissions.includes(permission)).sort();
  assert.deepEqual(delta, ["scripting", "webNavigation"], "permission delta must be exact");
  assert(!on.permissions.includes("downloads"), "downloads permission is forbidden");
  assert.deepEqual(on.host_permissions, off.host_permissions, "host permissions must not change");
  assert.deepEqual(on.content_scripts, off.content_scripts, "no static diagnostic content script is allowed");
  const wars = JSON.stringify(on.web_accessible_resources || []);
  assert(!wars.includes(TITLE_DIAGNOSTIC_FILES.main), "MAIN collector must not be web-accessible");
  const htmlOff = makeChromeLivePopupHtml({ titleDiagnosticEnabled: false });
  const htmlOn = makeChromeLivePopupHtml({ titleDiagnosticEnabled: true });
  assert(!htmlOff.includes("title-navigation-diagnostic"), "diagnostic popup controls leaked into disabled output");
  assert(htmlOn.includes("Title navigation diagnostic") && htmlOn.includes(TITLE_DIAGNOSTIC_FILES.popup), "enabled popup controls missing");
  assert(!/<script(?![^>]*src=)[^>]*>/i.test(htmlOn), "inline popup JavaScript is forbidden");
  assert.equal(getExtensionId(TARGET_VARIANT), EXPECTED_ID, "stable extension ID changed");
}

function assertRuntimeContract() {
  const isolated = makeTitleNavigationDiagnosticIsolatedJs();
  const main = makeTitleNavigationDiagnosticMainJs();
  const popup = makeTitleNavigationDiagnosticPopupJs();
  const worker = makeTitleNavigationDiagnosticServiceWorkerJs();
  for (const [label, source] of Object.entries({ isolated, main, popup, worker })) syntax(source, label);

  const passive = isolated + "\n" + main + "\n" + worker;
  const forbiddenExecutable = [
    /\.setTitle\s*\(/, /\.setEmoji\s*\(/, /\.renameNative\s*\(/, /\bPATCH\b/,
    /\blocalStorage\b/, /\bsessionStorage\b/, /document\.cookie/,
    /location\.(?:assign|replace)\s*\(/, /(?:window\.)?location(?:\.href)?\s*=/,
    /history\s*\.\s*(?:pushState|replaceState)\s*=/,
    /history\s*\[\s*["'](?:pushState|replaceState)["']\s*\]\s*=/,
    /\.click\s*\(/, /dispatchEvent\s*\(\s*new\s+(?:Mouse|Input|Keyboard)Event/,
  ];
  for (const pattern of forbiddenExecutable) assert(!pattern.test(passive), `passivity violation: ${pattern}`);
  assert.equal((popup.match(/anchor\.click\(\)/g) || []).length, 1, "popup export must use one temporary anchor click");
  assert(!/\blocalStorage\b|\bsessionStorage\b|document\.cookie/.test(popup), "popup must not access page storage");
  assert(!/history\s*\.\s*(?:pushState|replaceState)/.test(isolated + main), "history APIs must not be wrapped or read");

  for (const key of Object.values(C.storage)) assert(worker.includes(key), `missing storage key ${key}`);
  const foundKeys = [...worker.matchAll(/h2o:dev:title-stage0b2b:v1:[a-z-]+/g)].map((match) => match[0]);
  assert.deepEqual(new Set(foundKeys), new Set(Object.values(C.storage)), "unexpected diagnostic storage key");
  assert.equal(C.limits.maxEvents, 500);
  assert.equal(C.limits.maxDocuments, 20);
  assert.equal(C.limits.maxStoredBytes, 128 * 1024);
  assert.equal(C.limits.maxEventPayloadBytes, 2 * 1024);
  assert.equal(C.limits.maxTitleLengthMetadata, 128);
  assert.equal(C.limits.maxErrorMessage, 200);
  assert.equal(C.limits.maxStackFrames, 5);
  assert.equal(C.limits.maxStackChars, 500);
  assert(C.limits.maxStatusTtlMs <= 24 * 60 * 60 * 1000);

  for (const id of Object.values(C.registrationIds)) assert.equal((worker.match(new RegExp(id, "g")) || []).length >= 1, true, `missing registration ID ${id}`);
  assert(worker.includes("persistAcrossSessions: false") && worker.includes('runAt: "document_start"'), "dynamic registration lifecycle missing");
  assert(worker.includes('world: "MAIN"') && worker.includes('world: "ISOLATED"'), "world isolation missing");
  assert(worker.includes("executeScript") && worker.includes("registerContentScripts") && worker.includes("getRegisteredContentScripts"), "current/future injection missing");
  assert(worker.includes("writeChain") && worker.includes("dedupSuppressedCount") && worker.includes("maxStoredBytes"), "serialized bounded reducer missing");
  assert(worker.includes('throw new Error("Unknown diagnostic message operation.")'), "unknown service-worker operations must be rejected");
  assert(worker.includes('throw new Error("Unknown diagnostic operation.")'), "unknown popup operations must be rejected");
  assert(worker.includes("worker-wake") && worker.includes("unregisterOwned") && worker.includes("reconcile"), "restart reconciliation missing");
  assert(worker.includes("collector-teardown") && isolated.includes("removeListener") && main.includes("unsubscribe"), "idempotent teardown ownership missing");
  assert(isolated.includes("event.source !== window") && isolated.includes("ALLOWED_MAIN_TYPES") && isolated.includes("maxEventPayloadBytes"), "bridge validation missing");
  assert(main.includes('direction: "main-to-isolated"') && !main.includes("chrome.runtime"), "MAIN collector must be evidence-only");
  assert(worker.includes("onHistoryStateUpdated") && worker.includes("onReferenceFragmentUpdated"), "safe history navigation evidence missing");
  assert(isolated.includes("MutationObserver") && isolated.includes("PerformanceObserver"), "DOM/performance observation missing");
  assert(main.includes("ChatTitle.subscribe") || main.includes("current.subscribe"), "direct title subscription missing");
  assert(popup.includes("URL.createObjectURL") && popup.includes("URL.revokeObjectURL"), "bounded popup export missing");
}

function assertBuildIntegration() {
  const build = read("tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs");
  const manifest = read("tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs");
  assert(build.includes("H2O_TITLE_DIAGNOSTIC") && build.includes("OUTPUT_VARIANT"), "exact diagnostic build gate missing");
  assert(build.includes("makeTitleNavigationDiagnosticServiceWorkerJs") && build.includes("checkGeneratedJavaScript(file)"), "diagnostic generation/syntax check missing");
  assert(build.includes("Duplicate Stage 0B-2B diagnostic service-worker snippet"), "duplicate snippet guard missing");
  assert(build.includes("fs.unlinkSync(path.join(OUT_DIR, name))"), "disabled stale-file removal missing");
  assert(manifest.includes('permissions.push("webNavigation", "scripting")'), "permission gate missing");
}

function assertGenerated() {
  assert(fs.existsSync(OUT) && fs.statSync(OUT).isDirectory(), "generated target extension is missing");
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3, "manifest must remain MV3");
  for (const permission of ["webNavigation", "scripting"]) assert(manifest.permissions.includes(permission), `generated permission missing: ${permission}`);
  assert(!manifest.permissions.includes("downloads"), "generated downloads permission forbidden");
  assert(!(manifest.content_scripts || []).some((entry) => (entry.js || []).some((name) => name.includes("title-navigation-diagnostic"))), "static diagnostic content scripts forbidden");
  assert(!JSON.stringify(manifest.web_accessible_resources || []).includes(TITLE_DIAGNOSTIC_FILES.main), "generated MAIN collector exposed through WAR");
  assert.equal(getExtensionId(TARGET_VARIANT), EXPECTED_ID, "generated variant extension ID changed");
  for (const name of Object.values(TITLE_DIAGNOSTIC_FILES)) {
    const file = path.join(OUT, name);
    assert(fs.existsSync(file) && fs.statSync(file).isFile(), `missing generated ${name}`);
    syntax(fs.readFileSync(file, "utf8"), name);
  }
  assert.equal(fs.readFileSync(path.join(OUT, TITLE_DIAGNOSTIC_FILES.isolated), "utf8"), makeTitleNavigationDiagnosticIsolatedJs(), "generated isolated collector drifted from source");
  assert.equal(fs.readFileSync(path.join(OUT, TITLE_DIAGNOSTIC_FILES.main), "utf8"), makeTitleNavigationDiagnosticMainJs(), "generated MAIN collector drifted from source");
  assert.equal(fs.readFileSync(path.join(OUT, TITLE_DIAGNOSTIC_FILES.popup), "utf8"), makeTitleNavigationDiagnosticPopupJs(), "generated popup controller drifted from source");
  const bg = fs.readFileSync(path.join(OUT, "bg.js"), "utf8");
  const popup = fs.readFileSync(path.join(OUT, "popup.html"), "utf8");
  const loader = fs.readFileSync(path.join(OUT, "loader.js"), "utf8");
  assert.equal((bg.match(/H2O_TITLE_STAGE0B2B_SERVICE_WORKER_V1/g) || []).length, 1, "service-worker snippet count must be one");
  assert(bg.endsWith(makeTitleNavigationDiagnosticServiceWorkerJs()), "generated service-worker snippet drifted from source");
  assert(popup.includes("Title navigation diagnostic") && popup.includes(TITLE_DIAGNOSTIC_FILES.popup), "generated popup controls missing");
  assert(!JSON.stringify(manifest).includes("h2o-cp-title-stage0b") && !bg.includes("h2o-cp-title-stage0b") && !loader.includes("h2o-cp-title-stage0b"), "temporary worktree path leaked");
  for (const prefix of ["9B0a", "9B1a", "9C1a"]) {
    assert(loader.includes(prefix), `loader title delivery missing ${prefix}`);
    assert(fs.readFileSync(PROXY, "utf8").includes(prefix), `proxy title delivery missing ${prefix}`);
  }
  const proxy = fs.readFileSync(PROXY, "utf8");
  assert(!proxy.includes("9D1a"), "disabled 9D1a leaked into active proxy");
  syntax(bg, "generated bg.js"); syntax(loader, "generated loader.js");
}

assertFileScope();
assertTitleState();
assertVariantIsolation();
assertRuntimeContract();
assertBuildIntegration();
if (GENERATED) assertGenerated();

const generated = {
  isolatedBytes: Buffer.byteLength(makeTitleNavigationDiagnosticIsolatedJs()),
  mainBytes: Buffer.byteLength(makeTitleNavigationDiagnosticMainJs()),
  popupBytes: Buffer.byteLength(makeTitleNavigationDiagnosticPopupJs()),
  serviceWorkerBytes: Buffer.byteLength(makeTitleNavigationDiagnosticServiceWorkerJs()),
};
console.log(JSON.stringify({
  ok: true,
  validator: "title-stage0b2b-direct-diagnostic",
  mode: GENERATED ? "generated" : "source",
  schema: C.schema,
  extensionId: EXPECTED_ID,
  sha256: crypto.createHash("sha256").update(JSON.stringify(generated)).digest("hex"),
  generated,
}, null, 2));
