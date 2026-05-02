// Identity Phase 3.8D validation - email-code recovery plus mandatory set-password.
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
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const MARKER_KEY = "h2oIdentityProviderPasswordUpdateRequiredV1";

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

function assertNoPageProviderOwnership(label, source) {
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: must not import or probe provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships)['"`]/.test(source),
    `${label}: must not call Supabase directly`);
  assert(!/\b(service_role|service-role|serviceRoleKey)\b/i.test(source),
    `${label}: must not contain service-role strings`);
}

function assertNoUiLeakFields(label, source) {
  assert(!/\b(access_token|refresh_token|rawSession|rawUser|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not contain token/session/raw-user or unsafe DB field names`);
  assert(!/h2oIdentityProviderPersistentRefreshV1|h2oIdentityProviderSessionV1|h2oIdentityProviderPasswordUpdateRequiredV1/.test(source),
    `${label}: must not reference background-owned provider credential/marker keys`);
}

function assertNoPasswordPersistence(label, source) {
  assert(!/(localStorage|sessionStorage|chrome\.storage)\s*\.[\s\S]{0,160}password/i.test(source),
    `${label}: password values must not be written to page/chrome storage`);
  assert(!/password[\s\S]{0,120}(diagnostic|diagnostics|console\.log|console\.warn|audit)/i.test(source),
    `${label}: password values must not be logged, diagnosed, or audited`);
}

console.log("\n-- Identity Phase 3.8D email-code recovery validation -----------");

const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const releaseRunner = read(RELEASE_RUNNER_REL);
const docs = read(DOC_REL);

const requestEmailOtp = extractFunction(provider, "requestEmailOtp");
assert(requestEmailOtp.includes("client.auth.signInWithOtp") &&
  requestEmailOtp.includes("shouldCreateUser: false") &&
  !requestEmailOtp.includes("signUp("),
  "normal and recovery email-code requests must be existing-user-only with shouldCreateUser:false");

const verifyEmailOtp = extractFunction(provider, "verifyEmailOtp");
assert(verifyEmailOtp.includes('client.auth.verifyOtp({ email, token: code, type: "email" })'),
  "email-code verification must use provider verifyOtp type:\"email\"");

const updatePasswordAfterRecovery = extractFunction(provider, "updatePasswordAfterRecovery");
assert(updatePasswordAfterRecovery.includes("normalizeProviderSignOutSession(rawSession)") &&
  updatePasswordAfterRecovery.includes("createEphemeralProviderStorage(safeSession)") &&
  updatePasswordAfterRecovery.includes("persistSession: true") &&
  updatePasswordAfterRecovery.includes("autoRefreshToken: false") &&
  updatePasswordAfterRecovery.includes("detectSessionInUrl: false") &&
  updatePasswordAfterRecovery.includes("client.auth.updateUser({ password })") &&
  !updatePasswordAfterRecovery.includes("rawSession:") &&
  !updatePasswordAfterRecovery.includes("user:"),
  "provider updatePasswordAfterRecovery must use helper-local ephemeral auth storage and return no raw session/user");

const updateUserMatches = provider.match(/\bupdateUser\s*\(/g) || [];
assert(updateUserMatches.length === 2 &&
  provider.includes("async function changePassword(config, input = {})") &&
  provider.includes("current_password: currentPassword") &&
  !provider.includes("currentPassword:"),
  "updateUser may appear only in provider recovery and signed-in password-change helpers, using current_password casing");
assert(!/\bclient\.auth\.updateUser\s*\(|\bupdateUser\s*\(/.test(background + loader + identityCore + identitySurfaceJs),
  "background/page/UI/loader must not call Supabase updateUser directly");
assert(!/\bsignInWithIdToken\s*\(|\bgetSession\s*\(/.test(provider + background + loader + identityCore + identitySurfaceJs),
  "3.8D must not add ID-token auth or provider getSession");

for (const action of [
  "identity:request-password-recovery-code",
  "identity:verify-password-recovery-code",
  "identity:update-password-after-recovery",
]) {
  assert(background.includes(`action === "${action}"`), `background bridge action missing: ${action}`);
  assert(loader.includes(`"${action}"`), `loader identity relay allowlist missing: ${action}`);
}

for (const method of [
  "requestPasswordRecoveryCode",
  "verifyPasswordRecoveryCode",
  "updatePasswordAfterRecovery",
]) {
  assert(identityCore.includes(method), `Identity Core facade missing ${method}`);
}
assert(identityCore.includes("RECOVERY_CODE_PENDING: 'recovery_code_pending'") &&
  identityCore.includes("PASSWORD_UPDATE_REQUIRED: 'password_update_required'"),
  "Identity Core must define recovery_code_pending and password_update_required states");
const signInWithEmailCodeFacade = extractFunction(identityCore, "signInWithEmailCode");
assert(signInWithEmailCodeFacade.includes("sendBridgeRaw('identity:request-email-otp'") &&
  signInWithEmailCodeFacade.includes("applyProviderBridgeFallbackState('signInWithEmailCode'") &&
  signInWithEmailCodeFacade.includes("status: STATES.EMAIL_PENDING"),
  "Identity Core normal email-code request must force email_pending locally after a successful bridge response");
const requestRecoveryFacade = extractFunction(identityCore, "requestPasswordRecoveryCode");
assert(requestRecoveryFacade.includes("sendBridgeRaw('identity:request-password-recovery-code'") &&
  requestRecoveryFacade.includes("applyProviderBridgeFallbackState('requestPasswordRecoveryCode'") &&
  requestRecoveryFacade.includes("status: STATES.RECOVERY_CODE_PENDING"),
  "Identity Core recovery-code request must force recovery_code_pending locally after a successful bridge response");
const bridgeFallback = extractFunction(identityCore, "applyProviderBridgeFallbackState");
assert(bridgeFallback.includes("persistAndNotify(source, previous, next") &&
  bridgeFallback.includes("skipBridgeWrite: true") &&
  bridgeFallback.includes("lastError: null"),
  "Identity Core provider fallback state helper must notify the UI, clear stale auth errors, and avoid clobbering background runtime");
const persistAndNotifyCore = extractFunction(identityCore, "persistAndNotify");
assert(persistAndNotifyCore.includes("meta.skipBridgeWrite !== true") &&
  persistAndNotifyCore.includes("scheduleBridgeWrite(snapshot)"),
  "Identity Core must be able to skip bridge writes for provider-owned pending states");

const markerNormalize = extractFunction(background, "identityProviderPasswordUpdateRequired_normalizeRecord");
const markerStore = extractFunction(background, "identityProviderPasswordUpdateRequired_storeReason");
assert(background.includes(`const IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY = "${MARKER_KEY}"`),
  "background must define the approved password-update-required marker key");
for (const field of ["version", "provider", "providerKind", "projectOrigin", "reason", "createdAt", "updatedAt"]) {
  assert(markerNormalize.includes(field) && markerStore.includes(field),
    `marker helper must preserve safe field: ${field}`);
}
for (const [name, pattern] of [
  ["emailMasked", /\bemailMasked\s*:/],
  ["pendingEmail", /\bpendingEmail\s*:/],
  ["raw email", /\bemail\s*:/],
  ["userId", /\buserId\s*:/],
  ["access token", /\baccess_token\s*:/],
  ["refresh token", /\brefresh_token\s*:/],
  ["rawSession", /\brawSession\s*:/],
  ["rawUser", /\brawUser\s*:/],
  ["password", /\bpassword\s*:/],
  ["providerResult", /\bproviderResult\s*:/],
  ["owner_user_id", /\bowner_user_id\s*:/],
  ["deleted_at", /\bdeleted_at\s*:/],
]) {
  assert(!pattern.test(markerNormalize) && !pattern.test(markerStore),
    `marker schema must not include ${name}`);
}
assert(markerStore.includes("providerPersistentRefreshSet({ [IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY]: record })"),
  "marker must be stored only through the background-owned chrome.storage.local helper");

const publishSafeRuntime = extractFunction(background, "identityProviderSession_publishSafeRuntime");
assert(publishSafeRuntime.includes("identityProviderPasswordUpdateRequired_isActive") &&
  publishSafeRuntime.includes("identityProviderPasswordUpdateRequired_runtimeFromSession") &&
  publishSafeRuntime.includes("honorPasswordUpdateRequired !== false"),
  "persistent restore must honor password_update_required before cloud sync restore");

const normalVerifyManager = extractFunction(background, "identityAuthManager_verifyEmailOtp");
assert(normalVerifyManager.includes("identityProviderPasswordUpdateRequired_remove()") &&
  normalVerifyManager.includes("identityProviderVerify_runtime") &&
  !normalVerifyManager.includes("identityProviderPasswordUpdateRequired_runtimeFromSession"),
  "normal email-code sign-in must clear recovery marker and stay separate from the password-update-required recovery path");
const snapshotToRuntime = extractFunction(background, "identitySnapshot_toRuntime");
assert(snapshotToRuntime.includes('status === "email_pending"') &&
  snapshotToRuntime.includes('status === "recovery_code_pending"') &&
  snapshotToRuntime.includes('status === "email_confirmation_pending"') &&
  snapshotToRuntime.includes("pendingEmail: keepsPendingEmail ? (rt.pendingEmail || null) : null"),
  "background snapshot-to-runtime sync must preserve background-owned pending email for code verification states");
const requestEmailOtpManager = extractFunction(background, "identityAuthManager_requestEmailOtp");
assert(requestEmailOtpManager.includes("identityProviderBundle_requestEmailOtp({ email: cleanEmail })") &&
  requestEmailOtpManager.includes("identityProviderOtp_pendingRuntime(cleanEmail)") &&
  requestEmailOtpManager.includes("identityAuthManager_publishSnapshotFromRuntime(pendingRuntime)"),
  "normal email-code request must publish email_pending so the UI switches from password to code entry");

const requestRecoveryManager = extractFunction(background, "identityAuthManager_requestPasswordRecoveryCode");
assert(requestRecoveryManager.includes("identityProviderBundle_requestEmailOtp({ email: cleanEmail })") &&
  requestRecoveryManager.includes("identityProviderPasswordRecovery_pendingRuntime(cleanEmail)") &&
  requestRecoveryManager.includes("identityAuthManager_publishSnapshotFromRuntime(pendingRuntime)") &&
  requestRecoveryManager.includes("identityProviderPasswordRecovery_pending(cleanEmail, providerResponse)"),
  "recovery-code request must reuse existing-user-only OTP request and publish recovery_code_pending");

const verifyRecoveryManager = extractFunction(background, "identityAuthManager_verifyPasswordRecoveryCode");
assert(verifyRecoveryManager.includes('rt.status !== "recovery_code_pending"') &&
  verifyRecoveryManager.includes("identityProviderBundle_verifyEmailOtp") &&
  verifyRecoveryManager.includes("identityProviderSession_storeRaw") &&
  verifyRecoveryManager.includes("identityProviderPersistentRefresh_storeFromSession") &&
  verifyRecoveryManager.includes("identityProviderPasswordUpdateRequired_store") &&
  verifyRecoveryManager.includes("identityProviderPasswordUpdateRequired_runtimeFromSession") &&
  !verifyRecoveryManager.includes("identityProviderSession_publishSafeRuntime"),
  "recovery-code verification must store session/refresh, write marker, and publish password_update_required without restoring ready state");

const updateRecoveryManager = extractFunction(background, "identityAuthManager_updatePasswordAfterRecovery");
assert(updateRecoveryManager.includes('rt.status !== "password_update_required"') &&
  updateRecoveryManager.includes("identityProviderSession_readRaw") &&
  updateRecoveryManager.includes("identityProviderBundle_updatePasswordAfterRecovery") &&
  updateRecoveryManager.includes("identityProviderPasswordUpdateRequired_remove") &&
  updateRecoveryManager.includes("honorPasswordUpdateRequired: false"),
  "password update must require marker state, call provider wrapper, clear marker, and then allow cloud restore");

const completeOnboardingManager = extractFunction(background, "identityAuthManager_completeOnboarding");
assert(completeOnboardingManager.includes('rt.status === "password_update_required"') &&
  completeOnboardingManager.includes("identityProviderPasswordUpdateRequired_isActive()") &&
  completeOnboardingManager.includes("identity/onboarding-password-update-required") &&
  completeOnboardingManager.indexOf("identityProviderPasswordUpdateRequired_isActive()") <
    completeOnboardingManager.indexOf("identityProviderBundle_completeOnboarding"),
  "complete-onboarding must fail closed while a recovery password update is required");

const signOutCleanup = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
assert(signOutCleanup.includes("IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY") &&
  signOutCleanup.includes("passwordUpdateMarkerRemoveOk"),
  "sign-out cleanup must remove and verify the password-update-required marker");

assert(identitySurfaceHtml.includes("h2oi-recovery-send") &&
  identitySurfaceHtml.includes("h2oi-pending-title") &&
  identitySurfaceHtml.includes("h2oi-pending-code-label") &&
  identitySurfaceHtml.includes("h2oi-pending-back") &&
  identitySurfaceHtml.includes("h2oi-set-password-form") &&
  identitySurfaceHtml.includes("h2oi-set-password") &&
  identitySurfaceHtml.includes("h2oi-set-confirm") &&
  identitySurfaceHtml.includes("h2oi-set-password-back") &&
  identitySurfaceHtml.includes("h2oi-set-password-start-over") &&
  identitySurfaceHtml.includes("h2oi-start-over"),
  "identity UI must include recovery send, code-entry panel, mandatory set-password controls, and reset navigation");
assert(identitySurfaceJs.includes("api.requestPasswordRecoveryCode") &&
  identitySurfaceJs.includes("api.verifyPasswordRecoveryCode") &&
  identitySurfaceJs.includes("api.updatePasswordAfterRecovery") &&
  identitySurfaceJs.includes("status === 'recovery_code_pending'") &&
  identitySurfaceJs.includes("status === 'email_pending' || status === 'recovery_code_pending'") &&
  identitySurfaceJs.includes("Enter the recovery code sent to your email.") &&
  identitySurfaceJs.includes("Recovery code") &&
  identitySurfaceJs.includes("const codePending = status === 'email_pending' || status === 'recovery_code_pending'") &&
  identitySurfaceJs.includes("status !== 'password_update_required'") &&
  identitySurfaceJs.includes("Verify recovery code") &&
  identitySurfaceJs.includes("Send new recovery code") &&
  identitySurfaceJs.includes("restartIdentityFlow") &&
  identitySurfaceJs.includes("api.signOut()") &&
  identitySurfaceJs.includes("evaluatePasswordStrength") &&
  identitySurfaceJs.includes("clearPasswordFields"),
  "identity UI must route recovery code verification separately, provide restart navigation, and require password strength/match before update");
assert(identityCore.includes("STATES.PASSWORD_UPDATE_REQUIRED") &&
  identityCore.includes("identity/password-update-required") &&
  identityCore.includes("failPasswordUpdate("),
  "Identity Core must prevent createInitialWorkspace from bypassing password_update_required");
assert(controlHubAccountSurface.includes("recovery_code_pending") &&
  controlHubAccountSurface.includes("password_update_required"),
  "Control Hub account state labels must include recovery states");

for (const [label, source] of [
  ["Identity Core", identityCore],
  ["identity.js", identitySurfaceJs],
  ["identity.html", identitySurfaceHtml],
  ["loader", loader],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoPageProviderOwnership(label, source);
}
for (const [label, source] of [
  ["identity.js", identitySurfaceJs],
  ["identity.html", identitySurfaceHtml],
  ["loader", loader],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoUiLeakFields(label, source);
  assertNoPasswordPersistence(label, source);
}
assertNoPasswordPersistence("Identity Core", identityCore);

const persistentRecordBuilder = extractFunction(background, "identityProviderPersistentRefresh_buildRecordResult");
assert(persistentRecordBuilder.includes("refresh_token: refreshToken") &&
  !persistentRecordBuilder.includes("access_token") &&
  !persistentRecordBuilder.includes("rawUser") &&
  !persistentRecordBuilder.includes("password"),
  "persistent refresh record must remain refresh-token-only plus safe metadata");

assert(releaseRunner.includes("validate-identity-phase3_8d-email-code-recovery.mjs"),
  "release runner must include the 3.8D email-code recovery validator");
assert(docs.includes("Phase 3.8D - Email-Code Recovery and Set Password") &&
  docs.includes("password_update_required") &&
  docs.includes(MARKER_KEY) &&
  docs.includes('client.auth.updateUser({ password })') &&
  docs.includes("shouldCreateUser:false"),
  "identity docs must document Phase 3.8D recovery boundaries");

console.log("PASS: Identity Phase 3.8D email-code recovery validation passed.");
