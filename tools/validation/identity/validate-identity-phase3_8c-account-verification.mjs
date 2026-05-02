// Identity Phase 3.8C validation - account creation verification and password UX.
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
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";

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
  assert(!/\b(access_token|refresh_token|rawSession|rawUser|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not contain raw token/session/user or unsafe DB fields`);
}

function assertNoPasswordPersistence(label, source) {
  assert(!/(localStorage|sessionStorage|chrome\.storage)\s*\.[\s\S]{0,140}password/i.test(source),
    `${label}: password values must not be written to browser or chrome storage`);
  assert(!/password[\s\S]{0,100}(diagnostic|diagnostics|console\.log|console\.warn|audit)/i.test(source),
    `${label}: password values must not be logged, diagnosed, or audited`);
}

console.log("\n-- Identity Phase 3.8C account verification validation ----------");

const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);
const docs = read(DOC_REL);

const requestEmailOtp = extractFunction(provider, "requestEmailOtp");
assert(requestEmailOtp.includes("client.auth.signInWithOtp") &&
  requestEmailOtp.includes("shouldCreateUser: false"),
  "email-code sign-in must remain existing-user-only with shouldCreateUser:false");

const providerSignupVerify = extractFunction(provider, "verifySignupEmailCode");
assert(providerSignupVerify.includes("client.auth.verifyOtp({ email, token: code, type: \"email\" })"),
  "signup confirmation must use provider verifyOtp with type:\"email\"");
assert(providerSignupVerify.includes("confirmationRequired") &&
  providerSignupVerify.includes("!rawSession"),
  "signup confirmation with no provider session must remain confirmation-pending");

const providerResend = extractFunction(provider, "resendSignupConfirmation");
assert(providerResend.includes("client.auth.resend({ type: \"signup\", email })"),
  "signup confirmation resend must use provider auth.resend({ type:\"signup\" })");
assert(!/\bsignInWithIdToken\s*\(|\bgetSession\s*\(/.test(provider + background + loader + identityCore + identitySurfaceJs),
  "3.8C must not add ID-token auth or provider getSession");
assert(provider.includes("async function updatePasswordAfterRecovery(config, input = {})") &&
  provider.includes("client.auth.updateUser({ password })"),
  "3.8D approved recovery password update must be confined to the provider helper");
assert(!/\bclient\.auth\.updateUser\s*\(|\bupdateUser\s*\(/.test(background + loader + identityCore + identitySurfaceJs),
  "background/page/UI/loader must not call Supabase updateUser directly");
assert(!/access_token=|refresh_token=|redirectTo|emailRedirectTo/i.test(identitySurfaceJs + identitySurfaceHtml),
  "3.8C UI must not parse recovery links or redirect tokens");

for (const helper of [
  "verifySignupEmailCode",
  "resendSignupConfirmation",
]) {
  assert(provider.includes(`async function ${helper}(config, input = {})`),
    `provider helper missing: ${helper}`);
  assert(background.includes(`${helper}Runner`),
    `background probe runner missing: ${helper}`);
}

for (const action of [
  "identity:verify-signup-email-code",
  "identity:resend-signup-confirmation",
]) {
  assert(background.includes(`action === "${action}"`), `background bridge action missing: ${action}`);
  assert(loader.includes(`"${action}"`), `loader identity relay allowlist missing: ${action}`);
}

const signUpManager = extractFunction(background, "identityAuthManager_signUpWithPassword");
assert(signUpManager.includes("providerSignUp.confirmationPending === true") &&
  signUpManager.includes("identityProviderPassword_confirmationPendingRuntime") &&
  signUpManager.includes("return providerSignUp.response"),
  "sign-up without a real session must publish confirmation-pending only");
assert(!/confirmationPending[\s\S]{0,240}identityProviderSession_storeRaw/.test(signUpManager) &&
  !/confirmationPending[\s\S]{0,240}identityProviderPersistentRefresh_storeFromSession/.test(signUpManager),
  "confirmation-pending sign-up branch must not store active or persistent credentials");

const verifyManager = extractFunction(background, "identityAuthManager_verifySignupEmailCode");
assert(verifyManager.includes("rt.status !== \"email_confirmation_pending\"") &&
  verifyManager.includes("identityProviderBundle_verifySignupEmailCode"),
  "signup code verification must require the confirmation-pending runtime and route through the provider bundle");
assert(verifyManager.includes("providerConfirm.confirmationPending === true") &&
  verifyManager.includes("return providerConfirm.response"),
  "signup code verification with no real session must stay confirmation-pending");
assert(verifyManager.includes("return identityAuthManager_publishPasswordSession(pendingEmail, providerConfirm.providerResult, \"signup_confirmation\")"),
  "signup code verification must store credentials only through the shared real-session publisher and mark credential setup complete");

const resendManager = extractFunction(background, "identityAuthManager_resendSignupConfirmation");
assert(resendManager.includes("rt.status !== \"email_confirmation_pending\"") &&
  resendManager.includes("identityProviderBundle_resendSignupConfirmation"),
  "signup confirmation resend must require confirmation-pending runtime and provider bundle ownership");
assert(!resendManager.includes("identityProviderSession_storeRaw") &&
  !resendManager.includes("identityProviderPersistentRefresh_storeFromSession"),
  "signup confirmation resend must not create active or persistent credentials");

for (const method of [
  "verifySignupEmailCode",
  "resendSignupConfirmation",
]) {
  assert(identityCore.includes(method), `Identity Core facade missing ${method}`);
}
assert(identityCore.includes("failSignupConfirmation") &&
  identityCore.includes("STATES.EMAIL_CONFIRMATION_PENDING"),
  "Identity Core must preserve confirmation-pending state for retryable signup-code failures");

for (const id of [
  "h2oi-signin-password-toggle",
  "h2oi-create-password-toggle",
  "h2oi-create-confirm-toggle",
  "h2oi-password-strength",
  "h2oi-confirmation-code",
  "h2oi-confirmation-verify",
  "h2oi-confirmation-resend",
  "h2oi-reset-panel",
]) {
  assert(identitySurfaceHtml.includes(id), `identity UI missing 3.8C element: ${id}`);
}
assert(!identitySurfaceHtml.includes("h2oi-auth-reset"),
  "reset password must not be a top-level auth tab");
assert(identitySurfaceHtml.includes("minlength=\"12\""),
  "create-account password inputs must require at least 12 characters in the UI");
assert(identitySurfaceJs.includes("evaluatePasswordStrength") &&
  identitySurfaceHtml.includes("At least 12") &&
  identitySurfaceJs.includes("api.verifySignupEmailCode") &&
  identitySurfaceJs.includes("api.resendSignupConfirmation"),
  "identity UI must validate password strength and call signup confirmation facade methods");
assert(identitySurfaceJs.includes("togglePasswordVisibility") &&
  identitySurfaceJs.includes("resetPasswordVisibility"),
  "identity UI must include safe show/hide password controls");
assert(identitySurfaceJs.includes("clearPasswordFields") &&
  identitySurfaceJs.includes("refs.confirmationCode") &&
  identitySurfaceJs.includes("refs.otpCode"),
  "identity UI must clear transient password and code inputs after actions");

assertNoPageProviderOwnership("Identity Core", identityCore);
assertNoPageProviderOwnership("identity.js", identitySurfaceJs);
assertNoPageProviderOwnership("identity.html", identitySurfaceHtml);
assertNoPasswordPersistence("Identity Core", identityCore);
assertNoPasswordPersistence("identity.js", identitySurfaceJs);
assertNoPasswordPersistence("identity.html", identitySurfaceHtml);

assert(releaseRunner.includes("validate-identity-phase3_8c-account-verification.mjs"),
  "release runner must include the 3.8C account verification validator");
assert(docs.includes("Phase 3.8C - Account Creation Verification") &&
  docs.includes("verifyOtp") &&
  docs.includes("type:\"email\"") &&
  docs.includes("auth.resend") &&
  docs.includes("type:\"signup\""),
  "identity docs must document Phase 3.8C signup confirmation boundaries");

console.log("PASS: Identity Phase 3.8C account verification validation passed.");
