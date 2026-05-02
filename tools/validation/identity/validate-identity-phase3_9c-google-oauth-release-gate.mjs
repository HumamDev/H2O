// Identity Phase 3.9C validation - Google OAuth release gate.
// Static only; no Supabase/network access and no repo mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_39B_REL = "tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs";
const VALIDATOR_SYNC_REL = "tools/validation/identity/validate-identity-phase2_9-sync.mjs";

const MANIFESTS = {
  controls: "build/chrome-ext-dev-controls/manifest.json",
  lean: "build/chrome-ext-dev-lean/manifest.json",
  production: "build/chrome-ext-prod/manifest.json",
  armed: "build/chrome-ext-dev-controls-armed/manifest.json",
  oauthGoogle: "build/chrome-ext-dev-controls-oauth-google/manifest.json",
};

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

function readJson(rel) {
  return JSON.parse(read(rel));
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function extractSection(source, heading, nextHeadingPattern) {
  const start = source.indexOf(heading);
  if (start < 0) return "";
  const rest = source.slice(start);
  const next = rest.search(nextHeadingPattern);
  return next > 0 ? rest.slice(0, next) : rest;
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

function permissions(rel) {
  return exists(rel) ? (readJson(rel).permissions || []).map(String) : [];
}

function assertNoPageOAuthOwnership(label, source) {
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: must not import/probe the provider bundle`);
  assert(!/\b(signInWithOAuth|exchangeCodeForSession|signInWithIdToken|getSession|getAuthToken|launchWebAuthFlow)\s*\(/.test(source),
    `${label}: must not call OAuth/provider APIs`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: must not call Supabase directly`);
  assert(!/\b(service_role|service-role|serviceRoleKey)\b/i.test(source),
    `${label}: must not contain service-role strings`);
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose tokens, provider tokens, raw auth data, or unsafe DB fields`);
}

console.log("\n-- Identity Phase 3.9C Google OAuth release-gate validation ------");

const docs = read(DOC_REL);
const provider = read(PROVIDER_REL);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);
const validator39b = read(VALIDATOR_39B_REL);
const syncValidator = read(VALIDATOR_SYNC_REL);
const phase39c = extractSection(docs, "## 15.28 Phase 3.9C - Google OAuth Release Gate", /\n## 16\./);

assert(phase39c, "docs must include Phase 3.9C Google OAuth Release Gate section");
for (const required of [
  "Google Cloud OAuth client type",
  "`Web application`",
  "Do not use a Chrome Extension client",
  "https://kjwrrkqqtxyxtuigianr.supabase.co/auth/v1/callback",
  "not the chromiumapp extension URL",
  "Google Client ID and Client Secret",
  "https://amjponmninhldimbkdkfhcmclmjfbibi.chromiumapp.org/identity/oauth/google",
  "https://kjwrrkqqtxyxtuigianr.supabase.co/*",
  "build/chrome-ext-dev-controls-oauth-google",
  "H2O_IDENTITY_OAUTH_PROVIDER=google",
  "amjponmninhldimbkdkfhcmclmjfbibi",
  "Microsoft/GitHub/Apple OAuth remains deferred",
  "Same-email account linking remains deferred",
  "OAuth provider tokens are intentionally discarded",
  "Chrome Web Store production builds require a stable production extension ID",
  "Production rollout requires a separate deployment gate",
]) {
  assert(phase39c.includes(required), `3.9C docs must include: ${required}`);
}
for (const checklist of [
  "Load only `build/chrome-ext-dev-controls-oauth-google`",
  "Grant Supabase optional host permission for `https://kjwrrkqqtxyxtuigianr.supabase.co/*`",
  "Click `Continue with Google`",
  "provider_backed",
  "supabase",
  "Password + Google",
  "persistent restore after Chrome restart",
  "no access token, refresh token, provider token, provider refresh token, raw session, raw user, raw OAuth response, `owner_user_id`, or `deleted_at`",
  "sign-out clears active session, persistent refresh, password marker, OAuth transient state, runtime, and snapshot",
  "onboarding immediately switches to signed-out Sign in/Create account state",
]) {
  assert(phase39c.includes(checklist), `manual Google OAuth release checklist missing: ${checklist}`);
}
assert(phase39c.includes("node tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs"),
  "3.9C docs must list the 3.9C validator command");

assert(!permissions(MANIFESTS.controls).includes("identity"),
  "default controls manifest must not include chrome identity permission");
assert(!permissions(MANIFESTS.lean).includes("identity"),
  "lean manifest must not include chrome identity permission");
assert(!permissions(MANIFESTS.production).includes("identity"),
  "production manifest must not include chrome identity permission");
assert(!permissions(MANIFESTS.armed).includes("identity"),
  "normal armed manifest must not include chrome identity permission");
assert(permissions(MANIFESTS.oauthGoogle).includes("identity"),
  "OAuth Google manifest must include chrome identity permission");

const beginOAuth = extractFunction(provider, "beginOAuthSignIn");
const completeOAuth = extractFunction(provider, "completeOAuthSignIn");
assert(beginOAuth.includes("client.auth.signInWithOAuth") &&
  completeOAuth.includes("client.auth.exchangeCodeForSession"),
  "provider source must own signInWithOAuth and exchangeCodeForSession");
assert((provider.match(/\bsignInWithOAuth\s*\(/g) || []).length === 1 &&
  (provider.match(/\bexchangeCodeForSession\s*\(/g) || []).length === 1,
  "provider source must contain exactly one signInWithOAuth and one exchangeCodeForSession call");
for (const rel of GENERATED_PROVIDER_RELS) {
  if (!exists(rel)) continue;
  const generatedProvider = read(rel);
  assert(generatedProvider.includes("signInWithOAuth") &&
    generatedProvider.includes("exchangeCodeForSession"),
    `${rel} must contain generated provider OAuth helpers`);
}

const oauthRedirect = extractFunction(background, "identityProviderOAuth_getRedirectUrl");
const oauthLaunch = extractFunction(background, "identityProviderOAuth_launchWebAuthFlow");
assert(oauthRedirect.includes('chrome.identity.getRedirectURL(IDENTITY_PROVIDER_OAUTH_REDIRECT_PATH)') &&
  background.includes('const IDENTITY_PROVIDER_OAUTH_REDIRECT_PATH = "identity/oauth/google"') &&
  oauthLaunch.includes("chrome.identity.launchWebAuthFlow"),
  "background must own getRedirectURL(\"identity/oauth/google\") and launchWebAuthFlow");
assert(!/\bsignInWithOAuth\s*\(|\bexchangeCodeForSession\s*\(|\bsignInWithIdToken\s*\(|\bgetAuthToken\s*\(|\bgetSession\s*\(/.test(background),
  "background must not call Supabase OAuth APIs, ID-token sign-in, getAuthToken, or getSession directly");
assert(!/\bsignInWithIdToken\s*\(|\bgetAuthToken\s*\(|\badmin\./.test(provider + background + loader + identityCore + identitySurfaceJs + identitySurfaceHtml + controlHub),
  "runtime surfaces must not use signInWithIdToken, chrome.identity.getAuthToken, or admin APIs");

for (const [label, source] of [
  ["loader", loader],
  ["Identity Core", identityCore],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["Control Hub", controlHub],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoPageOAuthOwnership(label, source);
}

const persistentStore = extractFunction(background, "identityProviderPersistentRefresh_buildRecordResult");
assert(persistentStore.includes("refresh_token") &&
  !/access_token|provider_token|provider_refresh_token|rawUser/.test(persistentStore),
  "persistent refresh record builder must store only Supabase refresh_token plus safe metadata");
assert(background.includes("provider_token") &&
  background.includes("provider_refresh_token") &&
  background.includes("provider_id_token") &&
  background.includes("identityProviderSession_normalizeStoredSession") &&
  provider.includes("normalizeProviderSessionForInternalStorage"),
  "background/provider session normalization must strip provider token fields before storage");
assert(validator39b.includes("runtime.onMessage.addListener") &&
  validator39b.includes("storage.onChanged.addListener") &&
  syncValidator.includes("extension-page runtime reset overrides stale sync_ready snapshot") &&
  syncValidator.includes("extension-page storage reset overrides stale sync_ready snapshot"),
  "cross-surface sign-out and stale onboarding snapshot reset coverage must exist");

assert(releaseRunner.includes("tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs") &&
  releaseRunner.includes("build/chrome-ext-dev-controls-oauth-google") &&
  releaseRunner.includes("H2O_IDENTITY_OAUTH_PROVIDER") &&
  releaseRunner.includes("tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs"),
  "release runner must include OAuth Google build, 3.9B validator, and 3.9C release-gate validator");

console.log("Identity Phase 3.9C Google OAuth release-gate validation passed.");
