// Identity Phase 3.7A validation - persistent sign-in implementation.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const IDENTITY_SURFACE_CSS_REL = "surfaces/identity/identity.css";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";

const PERSISTENT_KEY = "h2oIdentityProviderPersistentRefreshV1";
const SESSION_KEY = "h2oIdentityProviderSessionV1";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const signatureEnd = source.indexOf(") {", start);
  const bodyStart = signatureEnd >= 0 ? source.indexOf("{", signatureEnd) : source.indexOf("{", start);
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
    ["unsafe DB field", /\bowner_user_id\b|\bdeleted_at\b/],
    ["persistent refresh key", new RegExp(PERSISTENT_KEY)],
  ];
  for (const [name, pattern] of checks) {
    assert(!pattern.test(source), `${label}: ${name} must not appear in UI/page/loader source`);
  }
}

function runPersistentRecordFixture(backgroundSource) {
  const helperSource = [
    extractFunction(backgroundSource, "identityProviderSession_unwrapStoredSession"),
    extractFunction(backgroundSource, "identityProviderSession_refreshToken"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_normalizeProjectOrigin"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_projectOriginFromOptionalHost"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_getSupabaseContext"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_normalizeIso"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_normalizeRecord"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_makeDiagnostics"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_buildRecordResult"),
    extractFunction(backgroundSource, "identityProviderPersistentRefresh_recordFromSession"),
  ].join("\n\n");
  const fn = new Function(`
    let providerKind = "supabase";
    let providerMode = "provider_backed";
    const projectOrigin = "https://validator-project.supabase.co";
    function identityProviderConfig_get() {
      return {
        providerKind,
        providerMode,
        providerConfigured: providerKind === "supabase",
        valid: providerKind === "supabase",
        missingFields: [],
        errorCodes: [],
      };
    }
    function identityProviderConfig_getInjectedSource() {
      return identityProviderConfig_get();
    }
    function identityProviderConfig_validateShape(config) {
      return config && typeof config === "object" ? config : {};
    }
    function identityProviderConfig_isSupabaseConfigured(config) {
      const src = config && typeof config === "object" ? config : {};
      return src.providerKind === "supabase"
        && src.providerMode === "provider_backed"
        && src.providerConfigured === true
        && src.valid === true
        && Array.isArray(src.missingFields)
        && src.missingFields.length === 0
        && Array.isArray(src.errorCodes)
        && src.errorCodes.length === 0;
    }
    function identityProviderBundle_loadPrivateConfig() {
      return { ok: true, privateConfig: { projectUrl: projectOrigin } };
    }
    function identityProviderPermission_getExactHostPattern() {
      return projectOrigin + "/*";
    }
    function identityRuntime_nowIso() {
      return "2026-05-01T00:00:00.000Z";
    }
    ${helperSource}
    const rawSession = {
      access_token: "validator_access_token_must_not_persist",
      refresh_token: "validator_token_12345",
      expires_at: 2000000000,
      user: { id: "validator-user", email: "validator@example.com" },
    };
    const built = identityProviderPersistentRefresh_buildRecordResult(rawSession);
    const record = identityProviderPersistentRefresh_recordFromSession(rawSession);
    providerKind = "mock";
    providerMode = "local_dev";
    const mockBuilt = identityProviderPersistentRefresh_buildRecordResult(rawSession);
    return { built, record, mockBuilt };
  `);
  return fn();
}

console.log("\n-- Identity Phase 3.7A persistent sign-in validation ------------");

const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const identitySurfaceCss = read(IDENTITY_SURFACE_CSS_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const docs = read(DOC_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(background.includes(`const IDENTITY_PROVIDER_SESSION_KEY = "${SESSION_KEY}"`),
  "background must keep the active provider session key explicit");
assert(background.includes(`const IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY = "${PERSISTENT_KEY}"`),
  "background must define the approved persistent refresh key");

const providerSessionStorageStrict = extractFunction(background, "providerSessionStorageStrict");
assert(providerSessionStorageStrict.includes("chrome.storage.session"),
  "active provider session helper must use chrome.storage.session");
assert(!providerSessionStorageStrict.includes("chrome.storage.local"),
  "active provider session helper must not fall back to chrome.storage.local");

const persistentStorageStrict = extractFunction(background, "providerPersistentRefreshStorageStrict");
assert(persistentStorageStrict.includes("chrome.storage.local"),
  "persistent refresh helper must use chrome.storage.local");
assert(!persistentStorageStrict.includes("chrome.storage.session"),
  "persistent refresh helper must not use chrome.storage.session");

for (const helperName of ["providerPersistentRefreshSet", "providerPersistentRefreshGet", "providerPersistentRefreshRemove"]) {
  const helper = extractFunction(background, helperName);
  assert(helper.includes("providerPersistentRefreshStorageStrict()"),
    `${helperName} must use the dedicated persistent refresh storage helper`);
}

const supabaseContext = extractFunction(background, "identityProviderPersistentRefresh_getSupabaseContext");
assert(supabaseContext.includes('providerKind !== "supabase"') &&
  supabaseContext.includes('providerMode !== "provider_backed"') &&
  supabaseContext.includes("identityProviderConfig_isSupabaseConfigured") &&
  supabaseContext.includes("identityProviderConfig_getInjectedSource") &&
  supabaseContext.includes("identityProviderBundle_loadPrivateConfig") &&
  supabaseContext.includes("identityProviderPersistentRefresh_projectOriginFromOptionalHost"),
  "persistent refresh context must require real provider-backed Supabase config and exact project origin");

const restoreContext = extractFunction(background, "identityProviderPersistentRefresh_getRestoreContext");
for (const gate of ["providerConfigured", "clientReady", "permissionReady", "phaseNetworkEnabled", "networkReady"]) {
  assert(restoreContext.includes(`${gate} !== true`), `persistent restore must require ${gate}`);
}

const normalizeRecord = extractFunction(background, "identityProviderPersistentRefresh_normalizeRecord");
for (const field of ["version", "provider", "providerKind", "projectOrigin", "refresh_token", "createdAt", "updatedAt", "lastRotatedAt"]) {
  assert(normalizeRecord.includes(field), `persistent record normalizer must include ${field}`);
}
assert(!normalizeRecord.includes("access_token") && !normalizeRecord.includes("rawSession") && !normalizeRecord.includes("publicClient"),
  "persistent record normalizer must not accept access token, full session, or raw config fields");

const buildRecord = extractFunction(background, "identityProviderPersistentRefresh_buildRecordResult");
assert(buildRecord.includes("rawSessionHasRefreshToken") &&
  buildRecord.includes("persistentRecordBuilt") &&
  buildRecord.includes("providerOriginMatched"),
  "persistent record builder must produce safe write diagnostics");
assert(buildRecord.includes("identityProviderSession_refreshToken(rawSession)"),
  "persistent record builder must accept direct snake-case raw sessions with refresh_token");

const recordFromSession = extractFunction(background, "identityProviderPersistentRefresh_recordFromSession");
assert(recordFromSession.includes("identityProviderPersistentRefresh_buildRecordResult"),
  "persistent record creation must delegate to the gated record builder");
assert(buildRecord.includes("identityProviderPersistentRefresh_getSupabaseContext"),
  "persistent record creation must be gated by real Supabase context");
assert(buildRecord.includes("identityProviderSession_refreshToken"),
  "persistent record creation must extract only refresh token");
assert(!recordFromSession.includes("identityProviderSession_accessToken") && !recordFromSession.includes("access_token"),
  "persistent record creation must not persist access token");
const recordFixture = runPersistentRecordFixture(background);
assert(recordFixture.built && recordFixture.built.ok === true,
  "provider OTP verify fixture must build a persistent refresh record when refresh_token exists");
assert(recordFixture.record && recordFixture.record.refresh_token === "validator_token_12345",
  "direct snake-case raw session refresh_token must be preserved in the persistent record");
assert(!Object.prototype.hasOwnProperty.call(recordFixture.record, "access_token") &&
  !Object.prototype.hasOwnProperty.call(recordFixture.record, "user"),
  "persistent record fixture must not include access_token or raw user");
assert(recordFixture.built.diagnostics.rawSessionHasRefreshToken === true &&
  recordFixture.built.diagnostics.persistentRecordBuilt === true &&
  recordFixture.built.diagnostics.providerOriginMatched === true,
  "persistent write diagnostics fixture must report refresh token detection and record creation");
assert(recordFixture.mockBuilt && recordFixture.mockBuilt.ok === false &&
  recordFixture.mockBuilt.diagnostics.persistentRecordBuilt === false,
  "mock/local fixture must not build a persistent provider refresh record");

const verifyEmailOtp = extractFunction(background, "identityAuthManager_verifyEmailOtp");
assert(verifyEmailOtp.includes("identityProviderSession_storeRaw(providerVerify.providerResult)"),
  "verify success must keep storing the active raw session first");
assert(verifyEmailOtp.includes("identityProviderPersistentRefresh_storeFromSession"),
  "verify success must store the persistent refresh record for real provider-backed Supabase");
assert(verifyEmailOtp.includes("void persistentWrite") &&
  !verifyEmailOtp.includes("persistentSignInDiagnostics"),
  "verify success must keep persistent-write diagnostics internal");
const storeFromSession = extractFunction(background, "identityProviderPersistentRefresh_storeFromSession");
assert(storeFromSession.includes("identityProviderSession_restoreSuppressedDuringSignOut") &&
  storeFromSession.includes("identity/sign-out-in-progress"),
  "persistent refresh writes must be suppressed during sign-out cleanup");

const refreshRaw = extractFunction(background, "identityProviderSession_refreshRaw");
assert(refreshRaw.includes("identityProviderBundle_refreshProviderSession"),
  "lazy refresh must use the approved provider refresh helper");
assert(refreshRaw.includes("identityProviderPersistentRefresh_rotateFromSessionIfPresent"),
  "lazy refresh must rotate existing persistent refresh records");
assert(refreshRaw.includes("identityProviderSession_restoreSuppressedDuringSignOut") &&
  refreshRaw.includes("identity/provider-restore-suppressed"),
  "lazy refresh must not recreate active sessions during sign-out cleanup");

const restoreOnWake = extractFunction(background, "identityProviderPersistentRefresh_restoreOnWake");
assert(restoreOnWake.includes("identityProviderPersistentRefresh_getRestoreContext"),
  "persistent restore must validate readiness before reading/using refresh credential");
assert(restoreOnWake.includes("identityProviderBundle_refreshProviderSession"),
  "persistent restore must use the approved provider refresh helper");
assert(restoreOnWake.includes("providerSessionSet({ [IDENTITY_PROVIDER_SESSION_KEY]: providerResult.rawSession })"),
  "persistent restore must recreate active raw session only in chrome.storage.session");
assert(restoreOnWake.includes("identityProviderSession_publishSafeRuntime"),
  "persistent restore must publish only sanitized runtime/snapshot state");
assert(restoreOnWake.includes("identityProviderSession_restoreSuppressedDuringSignOut") &&
  restoreOnWake.includes("identity/provider-restore-suppressed"),
  "persistent restore must be suppressed during sign-out cleanup");
assert(!restoreOnWake.includes("getSession"),
  "persistent restore must not use provider getSession");

const hydrateOnWake = extractFunction(background, "identityProviderSession_hydrateOnWake");
assert(hydrateOnWake.includes("if (!rawSession)") &&
  hydrateOnWake.includes("if (allowRefresh) return identityProviderPersistentRefresh_restoreOnWake(shouldBroadcast)"),
  "wake hydration must prefer active session and use persistent restore only when active session is missing");
assert(hydrateOnWake.includes("identityProviderSession_restoreSuppressedDuringSignOut"),
  "wake hydration must honor sign-out restore suppression");

const signOutCleanup = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
assert(signOutCleanup.includes("providerSessionRemove([IDENTITY_PROVIDER_SESSION_KEY])"),
  "sign-out cleanup must remove the active provider session key");
assert(signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])"),
  "sign-out cleanup must remove the persistent refresh key");
assert(signOutCleanup.includes("providerSessionGet([IDENTITY_PROVIDER_SESSION_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshGet([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])"),
  "sign-out cleanup must verify active and persistent provider keys are absent before success");
for (const diagnostic of [
  "activeSessionRemoveAttempted",
  "activeSessionRemoveOk",
  "persistentRemoveAttempted",
  "persistentRemoveOk",
  "restoreSuppressedDuringSignOut",
]) {
  assert(signOutCleanup.includes(diagnostic), `sign-out cleanup diagnostics must include ${diagnostic}`);
}
const signOut = extractFunction(background, "identityAuthManager_signOut");
assert(signOut.includes("identityProviderSession_suppressRestoreForSignOut") &&
  signOut.includes("identityProviderSession_keepRestoreSuppressedAfterSignOut"),
  "sign-out must suppress restore until local cleanup completes");
assert(!signOut.includes("diagnostics:"),
  "sign-out response must not expose cleanup diagnostics publicly");

assert(!/chrome\.storage\.local[^\n;]*(access_token|h2oIdentityProviderSessionV1)/i.test(background),
  "background must not persist access token or full active session in chrome.storage.local");
assert(!/getSession\s*\(/.test(background + provider),
  "background/provider must not use provider getSession");

const providerRefresh = extractFunction(provider, "refreshProviderSession");
assert(providerRefresh.includes("refreshSession({ refresh_token: refreshToken })"),
  "provider refresh helper must refresh with the supplied refresh token");
assert(providerRefresh.includes("persistSession: false") &&
  providerRefresh.includes("autoRefreshToken: false") &&
  providerRefresh.includes("detectSessionInUrl: false"),
  "provider refresh helper must keep SDK persistence and auto-refresh disabled");
const providerSessionNormalize = extractFunction(provider, "normalizeProviderSessionForInternalStorage");
assert(providerSessionNormalize.includes("normalizeProviderRefreshToken(session.refresh_token || session.refreshToken)") &&
  providerSessionNormalize.includes("refresh_token: refreshToken || session.refresh_token"),
  "provider session normalizer must preserve a normalized refresh_token for persistent sign-in");

for (const [label, source] of [
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["identity surface CSS", identitySurfaceCss],
  ["Control Hub", controlHub],
  ["Control Hub Account plugin", controlHubAccount],
  ["loader", loader],
]) {
  assertNoUiProviderLeak(label, source);
}

assert(!/localStorage|sessionStorage/.test(identitySurfaceJs),
  "identity surface must not store OTP, tokens, or provider state in page storage");
assert(identityCore.includes("persistentSession: snapshot.mode === 'provider_backed' && snapshot.provider === 'supabase'"),
  "Identity Core diagnostics must expose persistentSession only for provider-backed Supabase snapshots");
assert(identitySurfaceHtml.includes("You stay signed in") &&
  identitySurfaceJs.includes("You stay signed in on this browser until you sign out or your session is revoked") &&
  controlHubAccountSurface.includes("You stay signed in on this browser until you sign out or your session is revoked"),
  "UI copy must describe persistent sign-in without exposing token internals");
assert(!/keep me signed in/i.test(identitySurfaceHtml + identitySurfaceJs + controlHubAccountSurface),
  "3.7A must not add a keep-me-signed-in checkbox");

assert(docs.includes("## 15.19 Phase 3.7A - Persistent Sign-In Implementation"),
  "docs must include Phase 3.7A persistent sign-in section");
assert(docs.includes(PERSISTENT_KEY) &&
  docs.includes("refresh token only") &&
  docs.includes("Never persist `access_token`"),
  "docs must document refresh-token-only persistent storage");
assert(docs.includes("mock/local-only flows must never create, read, or use"),
  "docs must document mock/local persistent-storage guard");
assert(releaseRunner.includes("validate-identity-phase3_7a-persistent-signin.mjs"),
  "release runner must include the Phase 3.7A validator");

console.log("  background owns persistent refresh-token-only storage");
console.log("  active raw session remains chrome.storage.session-only");
console.log("  restore uses provider refresh helper and readiness gates");
console.log("  sign-out clears active and persistent provider keys");
console.log("  UI/page/loader remain token-free and provider-free");
console.log("\nIdentity Phase 3.7A persistent sign-in validation PASSED");
