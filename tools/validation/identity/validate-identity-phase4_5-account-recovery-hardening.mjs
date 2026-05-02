// Identity Phase 4.5 validation - Account Recovery Hardening.
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
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_5-account-recovery-hardening.mjs";
const MARKER_KEY = "h2oIdentityProviderPasswordUpdateRequiredV1";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
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

function assertNoPageProviderOwnership(label, source) {
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: page/UI/loader must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: page/UI/loader must not import/probe provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: page/UI/loader must not call Supabase directly`);
}

function assertNoSensitiveUiSurface(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose token/session/raw auth/provider/private DB fields`);
  assert(!/h2oIdentityProviderSessionV1|h2oIdentityProviderPersistentRefreshV1|h2oIdentityProviderPasswordUpdateRequiredV1/.test(source),
    `${label}: must not reference background-owned credential or marker storage keys`);
}

function assertNoPasswordOrCodePersistence(label, source) {
  assert(!/(localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*(?:password|code|otp)/i.test(source),
    `${label}: password/code values must not use page storage`);
  assert(!/chrome\.storage\.(?:local|session)[\s\S]{0,180}(?:password\s*:|currentPassword|current_password|code\s*:|otp\s*:)/i.test(source),
    `${label}: password/code payloads must not be written to chrome storage`);
  assert(!/(?:password|currentPassword|current_password|code|otp)[\s\S]{0,120}console\.(?:log|warn|error|info)|console\.(?:log|warn|error|info)[\s\S]{0,120}(?:password|currentPassword|current_password|code|otp)/i.test(source),
    `${label}: password/code payloads must not be logged`);
  assert(!/(?:diagnostics?|snapshot|audit)[\s\S]{0,120}(?:password\s*:|currentPassword|current_password)|(?:password\s*:|currentPassword|current_password)[\s\S]{0,120}(?:diagnostics?|snapshot|audit)/i.test(source),
    `${label}: password payloads must not enter diagnostics, snapshots, or audits`);
}

console.log("\n-- Identity Phase 4.5 account recovery hardening validation -----");

const docs = read(DOC_REL);
const provider = read(PROVIDER_REL);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.5B - Account Recovery Hardening Gate") &&
  docs.includes("Recovery verify") &&
  docs.includes("password_update_required") &&
  docs.includes("Reset-link completion") &&
  docs.includes("Deferred") &&
  docs.includes(MARKER_KEY) &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must document Phase 4.5B recovery hardening policy and validator commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.5 recovery hardening validator");

const requestEmailOtp = extractFunction(provider, "requestEmailOtp");
assert(requestEmailOtp.includes("client.auth.signInWithOtp") &&
  requestEmailOtp.includes("shouldCreateUser: false") &&
  !requestEmailOtp.includes("signUp("),
  "recovery OTP request must reuse existing-user-only signInWithOtp with shouldCreateUser:false");
const verifyEmailOtp = extractFunction(provider, "verifyEmailOtp");
assert(verifyEmailOtp.includes('client.auth.verifyOtp({ email, token: code, type: "email" })'),
  "recovery verification must use provider verifyOtp type:\"email\"");
const updatePasswordAfterRecoveryProvider = extractFunction(provider, "updatePasswordAfterRecovery");
assert(updatePasswordAfterRecoveryProvider.includes("createEphemeralProviderStorage(safeSession)") &&
  updatePasswordAfterRecoveryProvider.includes("persistSession: true") &&
  updatePasswordAfterRecoveryProvider.includes("autoRefreshToken: false") &&
  updatePasswordAfterRecoveryProvider.includes("detectSessionInUrl: false") &&
  updatePasswordAfterRecoveryProvider.includes("client.auth.updateUser({ password })") &&
  !/return\s+\{[\s\S]*rawSession\s*:/.test(updatePasswordAfterRecoveryProvider) &&
  !/return\s+\{[\s\S]*user\s*:/.test(updatePasswordAfterRecoveryProvider),
  "recovery set-password must be provider-owned, session-seeded, and return no raw auth data");
assert(!/\bclient\.auth\.verifyOtp\s*\(|\bclient\.auth\.updateUser\s*\(/.test(background + loader + identityCore + identitySurfaceJs),
  "background/page/UI/loader must not call provider verifyOtp or updateUser directly");

const requestEmailOtpManager = extractFunction(background, "identityAuthManager_requestEmailOtp");
const requestRecoveryManager = extractFunction(background, "identityAuthManager_requestPasswordRecoveryCode");
assert(requestEmailOtpManager.includes("identityProviderOtp_pendingRuntime(cleanEmail)") &&
  requestEmailOtpManager.includes("identityAuthManager_publishSnapshotFromRuntime(pendingRuntime)") &&
  !requestEmailOtpManager.includes("identityProviderPasswordRecovery_pendingRuntime"),
  "normal email-code sign-in must stay separate from recovery pending state");
assert(requestRecoveryManager.includes("identityProviderBundle_requestEmailOtp({ email: cleanEmail })") &&
  requestRecoveryManager.includes("identityProviderPasswordRecovery_pendingRuntime(cleanEmail)") &&
  requestRecoveryManager.includes("identityProviderPasswordRecovery_pending(cleanEmail, providerResponse)") &&
  requestRecoveryManager.includes("identityAuthManager_publishSnapshotFromRuntime(pendingRuntime)"),
  "recovery request must publish recovery_code_pending through the recovery-specific path");

const verifyRecoveryManager = extractFunction(background, "identityAuthManager_verifyPasswordRecoveryCode");
assert(verifyRecoveryManager.includes('rt.status !== "recovery_code_pending"') &&
  verifyRecoveryManager.includes("identityProviderBundle_verifyEmailOtp({ email: pendingEmail, code: cleanCode })") &&
  verifyRecoveryManager.includes("identityProviderSession_storeRaw") &&
  verifyRecoveryManager.includes("identityProviderPersistentRefresh_storeFromSession") &&
  verifyRecoveryManager.includes("identityProviderPasswordUpdateRequired_store") &&
  verifyRecoveryManager.includes("identityProviderPasswordUpdateRequired_runtimeFromSession") &&
  !verifyRecoveryManager.includes("identityProviderSession_publishSafeRuntime") &&
  !/\bsync_ready\b/.test(verifyRecoveryManager),
  "recovery verification must store a real session but publish password_update_required, not sync_ready");

const markerNormalize = extractFunction(background, "identityProviderPasswordUpdateRequired_normalizeRecord");
const markerStore = extractFunction(background, "identityProviderPasswordUpdateRequired_storeReason");
assert(background.includes(`const IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY = "${MARKER_KEY}"`),
  "background must keep the approved password-update-required marker key");
for (const field of ["version", "provider", "providerKind", "projectOrigin", "reason", "createdAt", "updatedAt"]) {
  assert(markerNormalize.includes(field) && markerStore.includes(field),
    `marker must preserve safe metadata field: ${field}`);
}
for (const [label, pattern] of [
  ["email", /\b(?:email|emailMasked|pendingEmail|pendingEmailMasked)\s*:/],
  ["password", /\b(?:password|currentPassword|current_password)\s*:/],
  ["code", /\b(?:code|otp|token)\s*:/],
  ["access token", /\baccess_token\s*:/],
  ["refresh token", /\brefresh_token\s*:/],
  ["raw session", /\brawSession\s*:/],
  ["raw user", /\brawUser\s*:/],
  ["provider response", /\b(?:providerResult|providerResponse|response)\s*:/],
  ["private DB fields", /\b(?:owner_user_id|deleted_at)\s*:/],
]) {
  assert(!pattern.test(markerNormalize) && !pattern.test(markerStore),
    `password-update marker must not contain ${label}`);
}

const publishSafeRuntime = extractFunction(background, "identityProviderSession_publishSafeRuntime");
const cloudRestore = extractFunction(background, "identityProviderSession_tryCloudIdentityRestore");
const completeOnboarding = extractFunction(background, "identityAuthManager_completeOnboarding");
assert(publishSafeRuntime.includes("identityProviderPasswordUpdateRequired_isActive") &&
  publishSafeRuntime.includes("identityProviderPasswordUpdateRequired_runtimeFromSession") &&
  publishSafeRuntime.includes("honorPasswordUpdateRequired !== false"),
  "safe runtime publishing must honor active password_update_required marker");
assert(cloudRestore.includes("identityCredentialState_isComplete") &&
  cloudRestore.includes("password_update_required"),
  "persistent/cloud restore must fail closed to password_update_required when credential setup is required");
assert(completeOnboarding.includes('rt.status === "password_update_required"') &&
  completeOnboarding.includes("identityProviderPasswordUpdateRequired_isActive()") &&
  completeOnboarding.includes("identity/onboarding-password-update-required"),
  "complete-onboarding must be blocked while password_update_required is active");

const updateRecoveryManager = extractFunction(background, "identityAuthManager_updatePasswordAfterRecovery");
assert(updateRecoveryManager.includes('rt.status !== "password_update_required"') &&
  updateRecoveryManager.includes("return { ...failure, nextStatus: \"password_update_required\" }") &&
  updateRecoveryManager.includes("identityProviderCredentialState_markCompleteForSession(rawSession, \"password_recovery_update\")") &&
  updateRecoveryManager.includes("identityProviderPasswordUpdateRequired_remove") &&
  updateRecoveryManager.includes("credentialState: \"complete\"") &&
  updateRecoveryManager.includes("honorPasswordUpdateRequired: false"),
  "recovery set-password failures must stay required; success must mark complete and clear marker");

const signOutCleanup = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
assert(signOutCleanup.includes("identityAuthManager_clearRuntime()") &&
  signOutCleanup.includes("identityAuthManager_clearStoredSnapshot()") &&
  signOutCleanup.includes("providerSessionRemove([IDENTITY_PROVIDER_SESSION_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY])") &&
  signOutCleanup.includes("storageSessionRemove([IDENTITY_PROVIDER_OAUTH_FLOW_KEY])") &&
  signOutCleanup.includes("broadcastIdentityPush(null)"),
  "sign-out must clear active session, persistent refresh, marker, OAuth transient state, runtime/snapshot, and broadcast reset");

const requestRecoveryFacade = extractFunction(identityCore, "requestPasswordRecoveryCode");
const verifyRecoveryFacade = extractFunction(identityCore, "verifyPasswordRecoveryCode");
const updateRecoveryFacade = extractFunction(identityCore, "updatePasswordAfterRecovery");
const failPasswordUpdate = extractFunction(identityCore, "failPasswordUpdate");
assert(requestRecoveryFacade.includes("sendBridgeRaw('identity:request-password-recovery-code'") &&
  requestRecoveryFacade.includes("status: STATES.RECOVERY_CODE_PENDING"),
  "facade must use recovery-specific request action and local recovery pending state");
assert(verifyRecoveryFacade.includes("sendBridgeRaw('identity:verify-password-recovery-code'") &&
  !verifyRecoveryFacade.includes("verifyEmailCode("),
  "facade recovery verify must not route through normal email-code verification");
assert(updateRecoveryFacade.includes("sendBridgeRaw('identity:update-password-after-recovery'") &&
  updateRecoveryFacade.includes("{ password }"),
  "facade recovery set-password must use the recovery update bridge action");
assert(failPasswordUpdate.includes("keepRequired") &&
  failPasswordUpdate.includes("status: keepRequired ? STATES.PASSWORD_UPDATE_REQUIRED : STATES.AUTH_ERROR") &&
  failPasswordUpdate.includes("syncReady: false"),
  "recovery set-password failures must keep password_update_required and never publish ready");

for (const action of [
  "identity:request-password-recovery-code",
  "identity:verify-password-recovery-code",
  "identity:update-password-after-recovery",
]) {
  assert(background.includes(`action === "${action}"`) && loader.includes(`"${action}"`),
    `background/loader must expose approved recovery bridge action: ${action}`);
}

assert(identitySurfaceJs.includes("api.requestPasswordRecoveryCode") &&
  identitySurfaceJs.includes("api.verifyPasswordRecoveryCode") &&
  identitySurfaceJs.includes("api.updatePasswordAfterRecovery") &&
  identitySurfaceJs.includes("status === 'recovery_code_pending'") &&
  identitySurfaceJs.includes("Verify recovery code") &&
  identitySurfaceJs.includes("Send new recovery code") &&
  identitySurfaceJs.includes("Enter the recovery code sent to your email.") &&
  identitySurfaceJs.includes("status !== 'password_update_required'") &&
  identitySurfaceJs.includes("clearPasswordFields") &&
  identitySurfaceJs.includes("if (refs.otpCode) refs.otpCode.value = '';"),
  "identity UI must use recovery-specific code entry, mandatory set-password, and clear code/password fields");
assert(identitySurfaceHtml.includes("h2oi-recovery-send") &&
  identitySurfaceHtml.includes("h2oi-set-password-form") &&
  identitySurfaceHtml.includes("h2oi-set-password") &&
  identitySurfaceHtml.includes("h2oi-set-confirm"),
  "identity UI must include recovery send and mandatory set-password controls");

assert(!/\b(resetLink|reset-link|recoveryToken|recovery-token|parseRecovery|handleRecovery|exchangeRecovery)\b/i.test(
  provider + background + loader + identityCore + identitySurfaceJs + identitySurfaceHtml + accountPlugin
), "reset-link completion and recovery-token parsing must remain absent");
assert(!/type:\s*["']recovery["']/.test(provider + background + loader + identityCore + identitySurfaceJs),
  "no Supabase recovery-token verification flow may be added in Phase 4.5B");

for (const [label, source] of [
  ["Identity Core", identityCore],
  ["Account plugin", accountPlugin],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["loader", loader],
]) {
  assertNoPageProviderOwnership(label, source);
  assertNoSensitiveUiSurface(label, source);
  assertNoPasswordOrCodePersistence(label, source);
}
const publicResponseHelpers = [
  extractFunction(background, "identityProviderPassword_failure"),
  extractFunction(background, "identityProviderPasswordUpdateRequired_response"),
  extractFunction(background, "identityProviderPassword_responseFromRuntime"),
  extractFunction(identityCore, "failFromBridge"),
  extractFunction(identityCore, "failPasswordUpdateFromBridge"),
  extractFunction(identityCore, "failPasswordUpdate"),
].join("\n");
assert(!/\b(?:password|currentPassword|current_password|code|otp|access_token|refresh_token|provider_token|provider_refresh_token|owner_user_id|deleted_at)\s*:/.test(publicResponseHelpers) &&
  !/(?:rawSession|rawUser)\s*:/.test(publicResponseHelpers),
  "recovery bridge/public response helpers must not include password/code/token/raw auth/private DB fields");

console.log("  recovery flow separation and existing-user-only OTP checks passed");
console.log("  recovery verification stays gated to password_update_required");
console.log("  marker metadata and cleanup checks passed");
console.log("  reset-link completion remains deferred");
console.log("  password/code/token leak checks passed");
console.log("\nIdentity Phase 4.5 account recovery hardening validation PASSED");
