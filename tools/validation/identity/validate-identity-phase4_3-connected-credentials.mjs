// Identity Phase 4.3 validation - Connected Credentials / Sign-In Methods.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const ACCOUNT_PLUGIN_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_3-connected-credentials.mjs";

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

function assertNoCredentialOwnership(label, source) {
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: page/UI/loader must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: page/UI/loader must not import/probe provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: page/UI/loader must not call Supabase directly`);
}

function assertNoCredentialLeaks(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at|identities)\b/.test(source),
    `${label}: must not expose tokens, provider tokens, provider identities, raw auth data, or unsafe DB fields`);
}

console.log("\n-- Identity Phase 4.3 connected credentials validation -----------");

const docs = read(DOC_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const identityCore = read(IDENTITY_CORE_REL);
const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.3B - Connected Credentials Display + Policy Hardening") &&
  docs.includes("Password sign-in enabled.") &&
  docs.includes("Google sign-in connected.") &&
  docs.includes("Password and Google sign-in enabled.") &&
  docs.includes("Add password is deferred.") &&
  docs.includes("Future unlinking/removal must enforce a last-credential lockout rule server-side") &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must document Phase 4.3B connected credential display, deferred actions, and validator commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.3 connected credentials validator");

const renderIdentitySubtab = extractFunction(accountPlugin, "renderIdentitySubtab");
const renderIdentitySectionTabs = extractFunction(accountPlugin, "renderIdentitySectionTabs");
const renderIdentitySectionBody = extractFunction(accountPlugin, "renderIdentitySectionBody");
const renderSignInMethodsSettings = extractFunction(accountPlugin, "renderSignInMethodsSettings");
const renderSignInMethods = extractFunction(accountPlugin, "renderSignInMethods");
assert(accountPlugin.includes("renderSignInMethods") &&
  accountPlugin.includes("normalizeCredentialStateLabel") &&
  accountPlugin.includes("normalizeCredentialProviderLabel") &&
  accountPlugin.includes("['methods', 'Sign-in Methods']") &&
  renderIdentitySubtab.includes("renderIdentitySectionTabs()") &&
  renderIdentitySubtab.includes("renderIdentitySectionBody()") &&
  renderIdentitySectionTabs.includes("Identity account sections") &&
  renderIdentitySectionBody.includes("key === 'methods'") &&
  renderIdentitySectionBody.includes("renderSignInMethodsSettings(ctx)") &&
  renderSignInMethodsSettings.includes("'Sign-in methods'") &&
  renderSignInMethodsSettings.includes("renderSignInMethods(ctx.credentialState, ctx.credentialProvider)") &&
  accountPlugin.includes("diag.credentialState || snap.credentialState") &&
  accountPlugin.includes("diag.credentialProvider || snap.credentialProvider"),
  "Account tab must render a Sign-in methods section derived from safe credentialState/credentialProvider only");
assert(renderSignInMethods.includes("Password sign-in enabled.") &&
  renderSignInMethods.includes("Google sign-in connected.") &&
  renderSignInMethods.includes("Password and Google sign-in enabled.") &&
  renderSignInMethods.includes("Add password is deferred.") &&
  renderSignInMethods.includes("Password setup required.") &&
  renderSignInMethods.includes("Sign-in method status is unknown."),
  "Sign-in methods section must include required safe copy for password/google/multiple/required/unknown states");
assert(!/\b(signInWithMicrosoft|signInWithGithub|signInWithGitHub|signInWithApple|microsoftSignIn|githubSignIn|appleSignIn)\b/i.test(
  accountPlugin + identityCore + background + provider + loader + identitySurfaceJs
), "Microsoft/GitHub/Apple OAuth must remain unimplemented");
assert(!/\b(addPassword|setPasswordForGoogle|linkPassword|linkCredential|unlinkCredential|removeCredential|removeGoogle|removePassword|disconnectGoogle|disconnectPassword)\b/i.test(
  accountPlugin + identityCore + background + provider + loader + identitySurfaceJs + identitySurfaceHtml
), "add-password and credential link/unlink/remove actions must remain absent");
assert(!/<button[\s\S]{0,180}(?:Add password|Remove|Unlink|Disconnect)|(?:Add password|Remove|Unlink|Disconnect)[\s\S]{0,180}<button/i.test(accountPlugin),
  "Account tab must not render add-password, unlink, remove, or disconnect buttons");

for (const [label, source] of [
  ["Control Hub Account plugin", accountPlugin],
  ["Identity Core", identityCore],
  ["loader", loader],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
]) {
  assertNoCredentialOwnership(label, source);
  assertNoCredentialLeaks(label, source);
}

const publicStateHelpers = [
  extractFunction(identityCore, "normalizeCredentialState"),
  extractFunction(identityCore, "normalizeCredentialProvider"),
  extractFunction(background, "identityCredentialState_normalize"),
  extractFunction(background, "identityCredentialProvider_normalize"),
].join("\n");
assert(publicStateHelpers.includes("complete") &&
  publicStateHelpers.includes("required") &&
  publicStateHelpers.includes("unknown") &&
  publicStateHelpers.includes("password") &&
  publicStateHelpers.includes("google") &&
  publicStateHelpers.includes("multiple"),
  "credential public state normalization must keep only safe summarized credential values");
assert(!/\b(provider_token|provider_refresh_token|rawSession|rawUser|identities)\b/.test(publicStateHelpers),
  "credential public state normalization must not include provider tokens or raw auth identity data");

console.log("  Account tab sign-in methods display is present");
console.log("  display derives from safe credentialState/credentialProvider only");
console.log("  add-password, unlink/remove, and future OAuth providers remain deferred");
console.log("  provider token/raw auth leak checks passed");
console.log("\nIdentity Phase 4.3 connected credentials validation PASSED");
