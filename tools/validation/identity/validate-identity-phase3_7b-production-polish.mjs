// Identity Phase 3.7B validation - production bridge response polish.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const IDENTITY_SURFACE_CSS_REL = "surfaces/identity/identity.css";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function extractFunction(source, name) {
  const syncIndex = source.indexOf(`function ${name}(`);
  const asyncIndex = source.indexOf(`async function ${name}(`);
  const start = (asyncIndex >= 0 && (syncIndex < 0 || asyncIndex < syncIndex)) ? asyncIndex : syncIndex;
  if (start === -1) return "";
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  if (bodyStart === -1) return "";
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function assertNoUiProviderLeak(label, source) {
  const checks = [
    ["Supabase SDK import", /@supabase\/supabase-js|@supabase\//i],
    ["provider bundle import/probe", /identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/],
    ["RPC call", /\.rpc\s*\(/],
    ["database table call", /\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships)['"`]/],
    ["service role", /\b(service_role|service-role|serviceRoleKey)\b/i],
    ["access token", /\baccess_token\b/],
    ["refresh token", /\brefresh_token\b/],
    ["raw session", /\brawSession\b/],
    ["raw user", /\brawUser\b/],
    ["raw config", /\brawConfig\b|\bprivateConfig\b|\bpublicClient\b/],
    ["unsafe DB field", /\bowner_user_id\b|\bdeleted_at\b/],
  ];
  for (const [name, pattern] of checks) {
    assert(!pattern.test(source), `${label}: ${name} must not appear in UI/page/loader source`);
  }
}

console.log("\n-- Identity Phase 3.7B production bridge polish validation ------");

const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const identitySurfaceCss = read(IDENTITY_SURFACE_CSS_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const docs = read(DOC_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

const verifyEmailOtp = extractFunction(background, "identityAuthManager_verifyEmailOtp");
assert(verifyEmailOtp.includes("identityProviderPersistentRefresh_storeFromSession"),
  "verify success must still write the persistent refresh record internally");
assert(verifyEmailOtp.includes("void persistentWrite"),
  "verify success must intentionally keep persistent write result internal");
assert(!verifyEmailOtp.includes("persistentSignInDiagnostics"),
  "verify success response must not expose persistent sign-in diagnostics");

const onboardingFailure = extractFunction(background, "identityProviderOnboarding_failure");
assert(onboardingFailure.includes("void diagnostics"),
  "onboarding failure helper must intentionally keep session diagnostics internal");
assert(!onboardingFailure.includes("Object.assign") &&
  !onboardingFailure.includes("identityProviderOnboarding_sanitizeDiagnostics"),
  "onboarding session-missing response must not flatten diagnostics into public fields");
for (const forbidden of [
  "providerSessionKeyExists",
  "providerSessionTopLevelKeys",
  "rawHasAccessToken",
  "rawHasRefreshToken",
  "normalizedHasAccessToken",
  "rpcSessionBuilt",
  "callerSawAccessToken",
]) {
  assert(!onboardingFailure.includes(forbidden),
    `onboarding public failure response must not include ${forbidden}`);
}

const signOutCleanup = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
assert(signOutCleanup.includes("providerSessionRemove([IDENTITY_PROVIDER_SESSION_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])"),
  "sign-out cleanup must still remove active and persistent provider keys");
assert(signOutCleanup.includes("providerSessionGet([IDENTITY_PROVIDER_SESSION_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshGet([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])"),
  "sign-out cleanup must still verify both provider keys are absent");
for (const diagnostic of [
  "activeSessionRemoveAttempted",
  "activeSessionRemoveOk",
  "persistentRemoveAttempted",
  "persistentRemoveOk",
  "restoreSuppressedDuringSignOut",
]) {
  assert(signOutCleanup.includes(diagnostic), `internal sign-out cleanup diagnostics must retain ${diagnostic}`);
}

const signOut = extractFunction(background, "identityAuthManager_signOut");
assert(signOut.includes("identityProviderSession_suppressRestoreForSignOut") &&
  signOut.includes("identityProviderSession_keepRestoreSuppressedAfterSignOut"),
  "sign-out must keep restore suppression around cleanup");
assert(signOut.includes('return { ok: true, nextStatus: "anonymous_local" };'),
  "sign-out success response must be the minimal production-safe shape");
assert(signOut.includes('errorCode: "identity/sign-out-failed"') &&
  signOut.includes('errorMessage: "Sign out failed."'),
  "sign-out failure response must remain generic");
assert(!signOut.includes("diagnostics:") &&
  !signOut.includes("localCleanupDiagnostics"),
  "sign-out responses must not expose cleanup diagnostics");

for (const fnName of [
  "identityProviderPersistentRefresh_storeFromSession",
  "identityProviderPersistentRefresh_restoreOnWake",
  "identityProviderSession_refreshRaw",
  "identityProviderSession_hydrateOnWake",
  "identityProviderSession_storeRaw",
]) {
  const fn = extractFunction(background, fnName);
  assert(fn.includes("identityProviderSession_restoreSuppressedDuringSignOut"),
    `${fnName} must honor sign-out restore suppression`);
}

for (const [label, source] of [
  ["Identity Core", identityCore],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["identity surface CSS", identitySurfaceCss],
  ["Control Hub", controlHub],
  ["Control Hub Account plugin", controlHubAccount],
  ["loader", loader],
]) {
  assertNoUiProviderLeak(label, source);
}

assert(docs.includes("## 15.20 Phase 3.7B - Persistent Sign-In Production Polish"),
  "docs must include Phase 3.7B production polish section");
assert(/public bridge responses are production-minimal/i.test(docs) &&
  docs.includes("diagnostics remain internal"),
  "docs must document production-minimal public responses and internal-only diagnostics");
assert(releaseRunner.includes("validate-identity-phase3_7b-production-polish.mjs"),
  "release runner must include the Phase 3.7B validator");

console.log("  public verify/sign-out/onboarding responses are minimal");
console.log("  internal sign-out cleanup verification remains intact");
console.log("  restore suppression remains enforced during sign-out");
console.log("  UI/page/loader remain token-free and provider-free");
console.log("\nIdentity Phase 3.7B production bridge polish validation PASSED");
