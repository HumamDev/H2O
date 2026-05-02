// Identity Phase 4.2 validation - Password Management hardening.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const ACCOUNT_PLUGIN_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_2-password-management.mjs";

const GENERATED_PROVIDER_RELS = [
  "build/chrome-ext-dev-controls/provider/identity-provider-supabase.js",
  "build/chrome-ext-dev-lean/provider/identity-provider-supabase.js",
  "build/chrome-ext-prod/provider/identity-provider-supabase.js",
  "build/chrome-ext-dev-controls-armed/provider/identity-provider-supabase.js",
  "build/chrome-ext-dev-controls-oauth-google/provider/identity-provider-supabase.js",
];

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function extractFunction(source, name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const syncStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 && (syncStart < 0 || asyncStart < syncStart) ? asyncStart : syncStart;
  if (start < 0) return "";
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  if (bodyStart < 0) return "";
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

function assertNoDirectProviderPasswordCalls(label, source) {
  assert(!/\bclient\.auth\.updateUser\s*\(|\bupdateUser\s*\(/.test(source),
    `${label}: must not call Supabase updateUser directly`);
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: must not import or probe provider bundle from page/loader surfaces`);
}

function assertNoSensitiveSurface(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose tokens, provider tokens, raw session/user, or unsafe DB fields`);
}

function assertNoPasswordPersistenceOrLogging(label, source) {
  assert(!/(localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*password/i.test(source),
    `${label}: password must not be written to or read from page storage`);
  assert(!/chrome\.storage\.(?:local|session)[\s\S]{0,160}(?:currentPassword|current_password|password\s*:)/i.test(source),
    `${label}: password payloads must not be written to chrome storage`);
  assert(!/(?:currentPassword|current_password|password)[\s\S]{0,120}console\.(?:log|warn|error|info)|console\.(?:log|warn|error|info)[\s\S]{0,120}(?:currentPassword|current_password|password)/i.test(source),
    `${label}: password payloads must not be logged`);
  assert(!/(?:diagnostics?|audit|snapshot)[\s\S]{0,120}(?:currentPassword|current_password|password\s*:)|(?:currentPassword|current_password|password\s*:)[\s\S]{0,120}(?:diagnostics?|audit|snapshot)/i.test(source),
    `${label}: password payloads must not enter diagnostics, audit entries, or snapshots`);
}

console.log("\n-- Identity Phase 4.2 password-management validation ------------");

const docs = read(DOC_REL);
const provider = read(PROVIDER_REL);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.2B - Password Management Hardening") &&
  docs.includes("Current-password verification") &&
  docs.includes("reset-link completion") &&
  docs.includes("Google-only add-password") &&
  docs.includes("Step-up verification") &&
  docs.includes("current_password") &&
  docs.includes("Add password is deferred") &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must document the Phase 4.2B password-management decisions and commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.2 password-management validator");

const updateAfterRecoveryProvider = extractFunction(provider, "updatePasswordAfterRecovery");
const changePasswordProvider = extractFunction(provider, "changePassword");
assert(updateAfterRecoveryProvider.includes("client.auth.updateUser({ password })") &&
  updateAfterRecoveryProvider.includes("createEphemeralProviderStorage(safeSession)") &&
  updateAfterRecoveryProvider.includes("persistSession: true") &&
  updateAfterRecoveryProvider.includes("autoRefreshToken: false") &&
  updateAfterRecoveryProvider.includes("detectSessionInUrl: false"),
  "provider updatePasswordAfterRecovery must be provider-owned and session-seeded only");
assert(changePasswordProvider.includes("client.auth.updateUser({") &&
  changePasswordProvider.includes("password,") &&
  changePasswordProvider.includes("current_password: currentPassword") &&
  !/client\.auth\.updateUser\s*\(\s*\{[\s\S]*currentPassword\s*:/.test(changePasswordProvider) &&
  changePasswordProvider.includes("createEphemeralProviderStorage(safeSession)") &&
  changePasswordProvider.includes("persistSession: true") &&
  changePasswordProvider.includes("autoRefreshToken: false") &&
  changePasswordProvider.includes("detectSessionInUrl: false"),
  "provider changePassword must use installed SDK current_password casing and no currentPassword Supabase field");
assert((provider.match(/\bclient\.auth\.updateUser\s*\(/g) || []).length === 2,
  "provider source must contain only the recovery set-password and signed-in password-change updateUser calls");

for (const rel of GENERATED_PROVIDER_RELS) {
  if (!exists(rel)) continue;
  const generated = read(rel);
  assert(generated.includes("updatePasswordAfterRecovery") &&
    generated.includes("changePassword") &&
    generated.includes("current_password"),
    `${rel}: generated provider bundle must contain provider-owned password helpers`);
  assert(!/client\.auth\.updateUser\s*\(\s*\{[\s\S]{0,320}currentPassword\s*:/.test(generated),
    `${rel}: generated provider bundle must not use currentPassword as a Supabase updateUser field`);
}

for (const [label, source] of [
  ["background", background],
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["loader", loader],
]) {
  assertNoPasswordPersistenceOrLogging(label, source);
}
for (const [label, source] of [
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["loader", loader],
]) {
  assertNoDirectProviderPasswordCalls(label, source);
  assertNoSensitiveSurface(label, source);
}
assert(!/\bclient\.auth\.updateUser\s*\(|@supabase\/supabase-js/.test(background),
  "background must wrap provider password helpers and must not call Supabase updateUser directly");

const changePasswordBackground = extractFunction(background, "identityAuthManager_changePassword");
assert(changePasswordBackground.includes('credentialProvider !== "password" && credentialProvider !== "multiple"') &&
  changePasswordBackground.includes("identityProviderBundle_changePassword") &&
  changePasswordBackground.includes('"password_account_change"') &&
  changePasswordBackground.includes("identityProviderCredentialState_markCompleteForSession") &&
  changePasswordBackground.includes("identityProviderSession_publishSafeRuntime") &&
  changePasswordBackground.includes("identityProviderPassword_responseFromRuntime"),
  "signed-in password change must require password-backed credentials, call provider helper, mark credential status, and publish safe runtime");

const recoveryVerifyBackground = extractFunction(background, "identityAuthManager_verifyPasswordRecoveryCode");
assert(recoveryVerifyBackground.includes('rt.status !== "recovery_code_pending"') &&
  recoveryVerifyBackground.includes("identityProviderSession_storeRaw") &&
  recoveryVerifyBackground.includes("identityProviderPersistentRefresh_storeFromSession") &&
  recoveryVerifyBackground.includes("identityProviderPasswordUpdateRequired_store") &&
  recoveryVerifyBackground.includes("identityProviderPasswordUpdateRequired_runtimeFromSession") &&
  recoveryVerifyBackground.includes("identityProviderPasswordUpdateRequired_response") &&
  !/sync_ready/.test(recoveryVerifyBackground),
  "recovery-code verification must store the real session but route to password_update_required, not sync_ready");

const updateAfterRecoveryBackground = extractFunction(background, "identityAuthManager_updatePasswordAfterRecovery");
assert(updateAfterRecoveryBackground.includes('rt.status !== "password_update_required"') &&
  updateAfterRecoveryBackground.includes("identityProviderBundle_updatePasswordAfterRecovery") &&
  updateAfterRecoveryBackground.includes('"password_recovery_update"') &&
  updateAfterRecoveryBackground.includes("identityProviderCredentialState_markCompleteForSession") &&
  updateAfterRecoveryBackground.includes("identityProviderPasswordUpdateRequired_remove") &&
  updateAfterRecoveryBackground.includes("credentialState: \"complete\"") &&
  updateAfterRecoveryBackground.includes("honorPasswordUpdateRequired: false"),
  "successful recovery set-password must mark password setup complete and clear the password-update marker before ready");

const requiredRuntime = extractFunction(background, "identityProviderPasswordUpdateRequired_runtimeFromSession");
const requiredResponse = extractFunction(background, "identityProviderPasswordUpdateRequired_response");
assert(requiredRuntime.includes('status: "password_update_required"') &&
  requiredRuntime.includes('credentialState: "required"') &&
  requiredRuntime.includes("syncReady: false") &&
  requiredRuntime.includes("profile: null") &&
  requiredRuntime.includes("workspace: null") &&
  requiredResponse.includes('nextStatus: "password_update_required"') &&
  requiredResponse.includes("syncReady: false"),
  "password_update_required runtime/response must fail closed and not expose ready profile/workspace state");

const signOutCleanup = background.slice(
  background.indexOf("diagnostics.activeSessionRemoveAttempted"),
  background.indexOf("diagnostics.oauthFlowRemoveAttempted")
);
assert(signOutCleanup.includes("providerSessionRemove([IDENTITY_PROVIDER_SESSION_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY])"),
  "sign-out cleanup must remove active session, persistent refresh, and password-update marker");

const failPasswordUpdate = extractFunction(identityCore, "failPasswordUpdate");
assert(failPasswordUpdate.includes("keepRequired") &&
  failPasswordUpdate.includes("status: keepRequired ? STATES.PASSWORD_UPDATE_REQUIRED : STATES.AUTH_ERROR") &&
  failPasswordUpdate.includes("syncReady: false"),
  "password-update failures must keep password_update_required when active and must not publish sync_ready");
assert(identityCore.includes("sendBridgeRaw('identity:update-password-after-recovery', { password })") &&
  identityCore.includes("sendBridgeRaw('identity:change-password', { currentPassword, password })") &&
  loader.includes('"identity:update-password-after-recovery"') &&
  loader.includes('"identity:change-password"'),
  "Identity Core and loader must expose only bridge/facade password-management actions");

assert(accountPlugin.includes("Current password") &&
  accountPlugin.includes("New password") &&
  accountPlugin.includes("Confirm new password") &&
  accountPlugin.includes("Password changed.") &&
  accountPlugin.includes("Current password or new password was not accepted.") &&
  accountPlugin.includes("Google sign-in is connected. Add password is deferred.") &&
  accountPlugin.includes("current.input.value = '';") &&
  accountPlugin.includes("next.input.value = '';") &&
  accountPlugin.includes("confirm.input.value = '';"),
  "Account plugin must keep credential-aware password UI, safe feedback, Google-only deferral, and field clearing");
assert(!/\b(addPassword|setPasswordForGoogle|linkPassword|unlinkCredential|removeCredential)\b/.test(
  provider + background + identityCore + accountPlugin + loader + identitySurfaceJs
), "Google-only add-password and credential unlink/remove must remain deferred");
assert(!/\b(resetLink|reset-link|recoveryToken|recovery-token|parseRecovery|handleRecovery|exchangeRecovery)\b/i.test(
  provider + background + identityCore + accountPlugin + loader + identitySurfaceJs + identitySurfaceHtml
), "reset-link completion and recovery-token parsing must remain absent");

const responseHelpers = [
  extractFunction(background, "identityProviderPassword_failure"),
  extractFunction(background, "identityProviderPassword_responseFromRuntime"),
  extractFunction(background, "identityProviderPasswordUpdateRequired_response"),
  extractFunction(identityCore, "failPasswordUpdateFromBridge"),
  extractFunction(identityCore, "failPasswordUpdate"),
].join("\n");
assert(!/\b(currentPassword|current_password|password)\s*:/.test(responseHelpers),
  "password-management bridge/public response helpers must not include password payload fields");
assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|owner_user_id|deleted_at)\b|(?:rawSession|rawUser)\s*:/.test(responseHelpers),
  "password-management bridge/public response helpers must not include tokens, raw auth data, or unsafe DB fields");

console.log("  provider-owned updateUser boundaries and current_password casing passed");
console.log("  password storage/logging/diagnostics checks passed");
console.log("  recovery password_update_required gate checks passed");
console.log("  Google-only add-password and reset-link completion remain deferred");
console.log("  sign-out cleanup and safe response checks passed");
console.log("\nIdentity Phase 4.2 password-management validation PASSED");
