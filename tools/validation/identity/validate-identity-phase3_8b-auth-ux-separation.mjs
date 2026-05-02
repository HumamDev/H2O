// Identity Phase 3.8B validation - auth UX separation.
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
  assert(!/(localStorage|sessionStorage|chrome\.storage)\s*\.[\s\S]{0,120}password/i.test(source),
    `${label}: password values must not be written to browser or chrome storage`);
  assert(!/password[\s\S]{0,80}(diagnostic|diagnostics|console\.log|console\.warn|audit)/i.test(source),
    `${label}: password values must not be logged, diagnosed, or audited`);
}

console.log("\n-- Identity Phase 3.8B auth UX separation validation ------------");

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
  requestEmailOtp.includes("options") &&
  requestEmailOtp.includes("shouldCreateUser: false"),
  "provider email-code sign-in must call signInWithOtp with shouldCreateUser:false");
assert(!requestEmailOtp.includes("signUp("),
  "provider email-code sign-in must not create accounts");
assert(provider.includes("identity/account-not-found"),
  "provider OTP errors must map missing accounts to a safe account-not-found code");
assert(provider.includes("identity/account-already-exists"),
  "provider password sign-up errors must map explicit duplicate accounts safely");
const signUpWithPassword = extractFunction(provider, "signUpWithPassword");
assert(signUpWithPassword.includes("user.identities") &&
  signUpWithPassword.includes("identity/account-already-exists"),
  "provider password sign-up must detect Supabase no-session duplicate-account shape when exposed");

assert(background.includes('"identity/account-not-found"') &&
  background.includes("No account found. Create an account first."),
  "background must allow and sanitize missing-account OTP errors");
assert(background.includes('"identity/account-already-exists"') &&
  background.includes("Account already exists. Sign in instead."),
  "background must allow and sanitize duplicate-account password errors");

assert(identityCore.includes("signInWithEmailCode") &&
  identityCore.includes("return signInWithEmailCode(email, opts);"),
  "Identity Core must expose signInWithEmailCode and keep signInWithEmail as an alias");
assert(identityCore.includes("'identity/account-not-found'") &&
  identityCore.includes("'identity/account-already-exists'"),
  "Identity Core must map account-not-found and account-already-exists to safe messages");

for (const id of [
  "h2oi-auth-sign-in",
  "h2oi-auth-create",
  "h2oi-signin-form",
  "h2oi-create-form",
  "h2oi-reset-panel",
  "h2oi-create-confirm",
]) {
  assert(identitySurfaceHtml.includes(id), `identity UI missing separated auth element: ${id}`);
}
assert(!identitySurfaceHtml.includes("h2oi-auth-reset"),
  "reset password must live under the sign-in password area, not as a top-level auth tab");
assert(!/h2oi-mode-code|h2oi-mode-password/.test(identitySurfaceHtml + identitySurfaceJs),
  "identity UI must not keep old Email code / Password auth-mode tabs");
assert(identitySurfaceHtml.includes("Email-code sign-in is only for existing accounts."),
  "create-account copy must say email-code sign-in is existing-account only");
assert(identitySurfaceHtml.includes("Confirm password"),
  "create-account form must require password confirmation");
assert(identitySurfaceJs.includes("authMode = 'signIn'") &&
  identitySurfaceJs.includes("authMode = 'create'") &&
  identitySurfaceJs.includes("resetExpanded"),
  "identity UI must drive Sign in / Create account tabs and inline reset request");
assert(identitySurfaceJs.includes("api.signInWithEmailCode") &&
  identitySurfaceJs.includes("api.signUpWithPassword") &&
  identitySurfaceJs.includes("api.requestPasswordReset"),
  "identity UI must call only facade methods for sign-in code, create account, and reset request");
assert(identitySurfaceJs.includes("refs.createPassword") &&
  identitySurfaceJs.includes("refs.createConfirm") &&
  identitySurfaceJs.includes("'identity/password-mismatch'"),
  "create-account UI must validate password confirmation before bridge submission");
assert(identitySurfaceJs.includes("clearPasswordFields"),
  "identity UI must clear password fields after success or failure");

assert(!/\bsignInWithIdToken\s*\(|\bgetSession\s*\(/.test(provider + background + loader + identityCore + identitySurfaceJs),
  "3.8B must not add ID-token auth or provider getSession");
assert(provider.includes("async function updatePasswordAfterRecovery(config, input = {})") &&
  provider.includes("client.auth.updateUser({ password })"),
  "3.8D approved recovery password update must be confined to the provider helper");
assert(!/\bclient\.auth\.updateUser\s*\(|\bupdateUser\s*\(/.test(background + loader + identityCore + identitySurfaceJs),
  "background/page/UI/loader must not call Supabase updateUser directly");
assert(!/access_token=|refresh_token=|redirectTo|emailRedirectTo/i.test(identitySurfaceJs + identitySurfaceHtml),
  "3.8B UI must not parse recovery links or redirect tokens");
assertNoPageProviderOwnership("Identity Core", identityCore);
assertNoPageProviderOwnership("identity.js", identitySurfaceJs);
assertNoPageProviderOwnership("identity.html", identitySurfaceHtml);
assertNoPasswordPersistence("Identity Core", identityCore);
assertNoPasswordPersistence("identity.js", identitySurfaceJs);
assertNoPasswordPersistence("identity.html", identitySurfaceHtml);

assert(releaseRunner.includes("validate-identity-phase3_8b-auth-ux-separation.mjs"),
  "release runner must include the 3.8B auth UX separation validator");
assert(docs.includes("Phase 3.8B - Auth UX Separation") &&
  docs.includes("shouldCreateUser:false"),
  "identity docs must document Phase 3.8B auth UX separation and existing-user-only email code");

console.log("PASS: Identity Phase 3.8B auth UX separation validation passed.");
