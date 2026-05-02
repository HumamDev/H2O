// Identity Phase 3.8A validation - email/password provider auth.
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

function assertNoTokenLeak(label, source) {
  const checks = [
    ["access token", /\baccess_token\b/],
    ["refresh token", /\brefresh_token\b/],
    ["raw session", /\brawSession\b/],
    ["raw user", /\brawUser\b/],
    ["service role", /\b(service_role|service-role|serviceRoleKey)\b/i],
    ["unsafe DB field", /\bowner_user_id\b|\bdeleted_at\b/],
  ];
  for (const [name, pattern] of checks) {
    assert(!pattern.test(source), `${label}: ${name} must not appear in page/UI surfaces`);
  }
}

console.log("\n-- Identity Phase 3.8A password auth validation ----------------");

const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);
const docs = read(DOC_REL);

for (const helper of [
  "signUpWithPassword",
  "signInWithPassword",
  "requestPasswordReset",
]) {
  assert(provider.includes(`async function ${helper}(config, input = {})`),
    `provider helper missing: ${helper}`);
  assert(background.includes(`${helper}Runner`),
    `background probe runner missing: ${helper}`);
}
assert(provider.includes("client.auth.signUp({ email, password })"),
  "provider sign-up must use Supabase signUp only inside provider bundle");
assert(provider.includes("client.auth.signInWithPassword({ email, password })"),
  "provider sign-in must use Supabase signInWithPassword only inside provider bundle");
assert(provider.includes("client.auth.resetPasswordForEmail(email)"),
  "provider reset request must call resetPasswordForEmail without redirect-token handling");
assert(provider.includes("async function updatePasswordAfterRecovery(config, input = {})") &&
  provider.includes("client.auth.updateUser({ password })"),
  "3.8D approved recovery password update must be confined to the provider helper");
assert(!/\bclient\.auth\.updateUser\s*\(|\bupdateUser\s*\(/.test(background + identityCore + identitySurfaceJs + loader),
  "background/page/UI/loader must not call Supabase updateUser directly");
assert(!/\bsignInWithIdToken\s*\(|\bgetSession\s*\(/.test(provider + background + loader + identityCore + identitySurfaceJs),
  "3.8A must not add ID-token auth or provider getSession");
assert(!/\bclient\.auth\.(signUp|signInWithPassword|resetPasswordForEmail)\s*\(/.test(background),
  "background must not call Supabase password auth APIs directly");

for (const action of [
  "identity:sign-up-with-password",
  "identity:sign-in-with-password",
  "identity:request-password-reset",
]) {
  assert(background.includes(`action === "${action}"`), `background bridge action missing: ${action}`);
  assert(loader.includes(`"${action}"`), `loader identity relay allowlist missing: ${action}`);
}

const publishPasswordSession = extractFunction(background, "identityAuthManager_publishPasswordSession");
assert(publishPasswordSession.includes("identityProviderSession_storeRaw"),
  "password session success must store active raw session through the existing session helper");
assert(publishPasswordSession.includes("identityProviderPersistentRefresh_storeFromSession"),
  "password session success must reuse the refresh-token-only persistent helper");
assert(publishPasswordSession.includes("identityProviderSession_publishSafeRuntime"),
  "password session success must publish only safe runtime/snapshot state");

const signUpManager = extractFunction(background, "identityAuthManager_signUpWithPassword");
assert(signUpManager.includes("providerSignUp.confirmationPending === true") &&
  signUpManager.includes("return providerSignUp.response"),
  "sign-up without a session must return confirmation-pending without storing credentials");
assert(!signUpManager.includes("providerSessionSet") &&
  !signUpManager.includes("providerPersistentRefreshSet"),
  "sign-up manager must not persist directly");

const resetManager = extractFunction(background, "identityAuthManager_requestPasswordReset");
assert(resetManager.includes("identityProviderBundle_requestPasswordReset"),
  "reset request must route through provider bundle only");
assert(!resetManager.includes("providerSessionSet") &&
  !resetManager.includes("identityProviderPersistentRefresh_storeFromSession"),
  "reset request must not create active or persistent sessions");

for (const method of [
  "signUpWithPassword",
  "signInWithPassword",
  "requestPasswordReset",
]) {
  assert(identityCore.includes(method), `Identity Core facade missing ${method}`);
}
assert(identityCore.includes("normalizePasswordInput") &&
  identityCore.includes("requireExtensionPageForPasswordAuth") &&
  !/localStorage\.(?:setItem|getItem)\([^)]*password/i.test(identityCore) &&
  !/writeJson\([^)]*password/i.test(identityCore),
  "Identity Core must validate password transiently, require extension-page direct bridge, and never write password values");
assert(identityCore.includes("sanitizeAuditMeta") &&
  identityCore.includes("/token|secret|password|refresh/i"),
  "Identity Core audit sanitizer must filter password-related metadata");

assert(identitySurfaceHtml.includes('type="password"'),
  "identity UI must expose a password input for provider-backed password auth");
assert(identitySurfaceJs.includes("api.signUpWithPassword") &&
  identitySurfaceJs.includes("api.signInWithPassword") &&
  identitySurfaceJs.includes("api.requestPasswordReset"),
  "identity UI must call the facade password methods only");
assert(identitySurfaceJs.includes("clearPasswordFields"),
  "identity UI must clear password form state after password auth/reset actions");
assert(identitySurfaceHtml.includes("h2oi-signin-form") &&
  identitySurfaceHtml.includes("h2oi-create-form") &&
  identitySurfaceHtml.includes("h2oi-reset-panel"),
  "identity UI must separate sign-in, account creation, and inline reset-request surfaces");
assert(!/@supabase\/supabase-js|\.rpc\s*\(|\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships)['"`]|identity-provider-supabase/i.test(identityCore + identitySurfaceJs + identitySurfaceHtml + loader),
  "page/UI/loader must remain Supabase-free");
assertNoTokenLeak("Identity Core", identityCore);
assertNoTokenLeak("identity.js", identitySurfaceJs);
assertNoTokenLeak("identity.html", identitySurfaceHtml);
assertNoTokenLeak("Control Hub Account plugin", controlHubAccount);

const controlHubAccountCopy = controlHubAccount.toLowerCase();
assert(controlHubAccount.includes("Provider sessions and tokens stay background-owned") &&
  controlHubAccountCopy.includes("change password for password-backed accounts"),
  "Control Hub Account plugin must keep account/security copy on background-owned identity and password-backed changes");
assert(releaseRunner.includes("validate-identity-phase3_8a-password-auth.mjs"),
  "release runner must include the 3.8A password auth validator");
assert(docs.includes("Phase 3.8A") &&
  docs.includes("Password reset is request-only"),
  "identity docs must document Phase 3.8A password auth boundaries");

console.log("PASS: Identity Phase 3.8A password auth validation passed.");
