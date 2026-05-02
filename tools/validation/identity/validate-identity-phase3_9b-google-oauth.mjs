// Identity Phase 3.9B validation - Google OAuth via background-owned Chrome identity.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const MANIFEST_SOURCE_REL = "tools/product/extension/chrome-live-manifest.mjs";
const BUILD_SOURCE_REL = "tools/product/extension/build-chrome-live-extension.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const SCHEMA_VALIDATOR_REL = "tools/validation/identity/validate-identity-phase3_2b-schema.mjs";
const OAUTH_MIGRATION_REL = "supabase/migrations/202605010005_identity_google_oauth_status.sql";

const DEFAULT_MANIFEST_REL = "build/chrome-ext-dev-controls/manifest.json";
const PROD_MANIFEST_REL = "build/chrome-ext-prod/manifest.json";
const OAUTH_MANIFEST_REL = "build/chrome-ext-dev-controls-oauth-google/manifest.json";

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

function extractFunction(source, name) {
  const syncIndex = source.indexOf(`function ${name}(`);
  const asyncIndex = source.indexOf(`async function ${name}(`);
  const sqlIndex = source.toLowerCase().indexOf(`function public.${name.toLowerCase()}`);
  const start = sqlIndex >= 0
    ? sqlIndex
    : ((asyncIndex >= 0 && (syncIndex < 0 || asyncIndex < syncIndex)) ? asyncIndex : syncIndex);
  if (start === -1) return "";
  if (sqlIndex >= 0) {
    const end = source.indexOf("$$;", start);
    return end > start ? source.slice(start, end + 3) : "";
  }
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
  assert(!/\b(signInWithOAuth|exchangeCodeForSession|signInWithIdToken|getSession|getAuthToken|launchWebAuthFlow)\s*\(/.test(source),
    `${label}: must not call provider/OAuth APIs`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships|identity_password_status|identity_oauth_status)['"`]/.test(source),
    `${label}: must not call Supabase directly`);
  assert(!/\b(service_role|service-role|serviceRoleKey)\b/i.test(source),
    `${label}: must not contain service-role strings`);
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose tokens, raw session/user, provider tokens, or unsafe DB fields`);
}

function manifestPermissions(rel) {
  return exists(rel) ? (readJson(rel).permissions || []).map(String) : [];
}

console.log("\n-- Identity Phase 3.9B Google OAuth validation ------------------");

const provider = read(PROVIDER_REL);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const manifestSource = read(MANIFEST_SOURCE_REL);
const buildSource = read(BUILD_SOURCE_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const docs = read(DOC_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);
const schemaValidator = read(SCHEMA_VALIDATOR_REL);
const oauthMigration = read(OAUTH_MIGRATION_REL);

const beginOAuth = extractFunction(provider, "beginOAuthSignIn");
const completeOAuth = extractFunction(provider, "completeOAuthSignIn");
const markOAuth = extractFunction(provider, "markOAuthCredentialCompleted");
assert(beginOAuth.includes("client.auth.signInWithOAuth") &&
  beginOAuth.includes("skipBrowserRedirect: true") &&
  beginOAuth.includes("flowType: \"pkce\"") &&
  beginOAuth.includes("scopes: \"openid email profile\""),
  "provider beginOAuthSignIn must use Supabase signInWithOAuth with PKCE and no browser redirect");
assert(completeOAuth.includes("client.auth.exchangeCodeForSession") &&
  completeOAuth.includes("normalizeProviderOAuthCallbackUrl") &&
  completeOAuth.includes("normalizeProviderSessionForInternalStorage") &&
  !/provider_token\s*:\s*|provider_refresh_token\s*:/.test(completeOAuth),
  "provider completeOAuthSignIn must exchange the code and return only normalized Supabase session data");
assert(markOAuth.includes('client.rpc("mark_oauth_credential_completed"') &&
  markOAuth.includes('provider !== "google"') &&
  !/return\s+\{[\s\S]*(rawSession\s*:|rawUser\s*:|provider_token|provider_refresh_token)/.test(markOAuth),
  "provider markOAuthCredentialCompleted must call only the approved OAuth credential RPC and return no raw data");
assert((provider.match(/\bsignInWithOAuth\s*\(/g) || []).length === 1,
  "signInWithOAuth must appear exactly once in provider source");
assert((provider.match(/\bexchangeCodeForSession\s*\(/g) || []).length === 1,
  "exchangeCodeForSession must appear exactly once in provider source");
assert(!/\bsignInWithIdToken\s*\(|\bgetSession\s*\(|\badmin\./.test(provider),
  "provider must not use ID-token sign-in, getSession, or admin APIs");

const oauthRedirect = extractFunction(background, "identityProviderOAuth_getRedirectUrl");
const oauthLaunch = extractFunction(background, "identityProviderOAuth_launchWebAuthFlow");
const googleManager = extractFunction(background, "identityAuthManager_signInWithGoogle");
assert(oauthRedirect.includes('chrome.identity.getRedirectURL(IDENTITY_PROVIDER_OAUTH_REDIRECT_PATH)') &&
  background.includes('const IDENTITY_PROVIDER_OAUTH_REDIRECT_PATH = "identity/oauth/google"'),
  "background must use chrome.identity.getRedirectURL(\"identity/oauth/google\")");
assert(oauthLaunch.includes("chrome.identity.launchWebAuthFlow") &&
  oauthLaunch.includes("interactive: true"),
  "background must own launchWebAuthFlow");
assert(googleManager.includes("identityProviderBundle_beginOAuthSignIn") &&
  googleManager.includes("identityProviderOAuth_launchWebAuthFlow") &&
  googleManager.includes("identityProviderBundle_completeOAuthSignIn") &&
  googleManager.includes("identityProviderSession_storeRaw") &&
  googleManager.includes("identityProviderPersistentRefresh_storeFromSession") &&
  googleManager.includes("identityProviderCredentialState_markOAuthCompleteForSession") &&
  googleManager.includes("identityProviderSession_publishSafeRuntime"),
  "Google sign-in manager must launch OAuth, store active session, persist refresh-token-only record, mark credential complete, then safe-restore state");
assert(!/\bsignInWithOAuth\s*\(|\bexchangeCodeForSession\s*\(|\bsignInWithIdToken\s*\(|\bgetAuthToken\s*\(|\bgetSession\s*\(/.test(background),
  "background must not call Supabase OAuth APIs, getAuthToken, ID-token sign-in, or getSession directly");
assert(background.includes("provider_token") &&
  background.includes("provider_refresh_token") &&
  background.includes("provider_id_token"),
  "background must strip provider token fields when normalizing stored provider sessions");

const persistentStore = extractFunction(background, "identityProviderPersistentRefresh_buildRecordResult");
assert(persistentStore.includes("refresh_token") &&
  !/access_token|provider_token|provider_refresh_token|rawUser/.test(persistentStore),
  "persistent refresh record builder must store only Supabase refresh_token plus safe metadata");
const signOutCleanup = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
assert(signOutCleanup.includes("IDENTITY_PROVIDER_OAUTH_FLOW_KEY") &&
  signOutCleanup.includes("IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY"),
  "sign-out cleanup must clear transient OAuth flow state and persistent refresh state");
assert(signOutCleanup.includes("broadcastIdentityPush(null)"),
  "sign-out cleanup must broadcast anonymous reset after local cleanup");
assert(background.includes("chrome.runtime.sendMessage({ type: MSG_IDENTITY_PUSH, snapshot: safeSnap }") &&
  background.includes("chrome.tabs.query({ url: [CHAT_MATCH] }"),
  "identity reset broadcasts must reach both extension pages and ChatGPT loader tabs");

assert(loader.includes('"identity:sign-in-with-google"'),
  "loader must allow only the facade bridge action for Google sign-in");
assert(identityCore.includes("signInWithGoogle") &&
  identityCore.includes("sendBridgeRaw('identity:sign-in-with-google'") &&
  identityCore.includes("providerConfigStatus?.capabilities?.oauth"),
  "Identity Core must expose only a facade method for Google sign-in");
assert(identityCore.includes("runtime.onMessage.addListener") &&
  identityCore.includes("applySharedSnapshot(msg.snapshot)") &&
  identityCore.includes("storage.onChanged.addListener") &&
  identityCore.includes("BRIDGE_STORAGE_SNAPSHOT_KEY = 'h2oIdentityMockSnapshotV1'") &&
  identityCore.includes("cancelBridgeWrite()") &&
  identityCore.includes("bridge-push-reset"),
  "Identity Core must listen for runtime/storage reset pushes so onboarding windows converge after sign-out elsewhere");
assert(identitySurfaceHtml.includes("Continue with Google") &&
  identitySurfaceJs.includes("api.signInWithGoogle"),
  "identity UI must offer Continue with Google through the facade");
assert(controlHubAccountSurface.includes("Google sign-in") &&
  controlHubAccountSurface.includes("credentialProvider"),
  "Account tab must display only safe Google credential status");
for (const [label, source] of [
  ["loader", loader],
  ["Identity Core", identityCore],
  ["identity.js", identitySurfaceJs],
  ["identity.html", identitySurfaceHtml],
  ["Control Hub", controlHub],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoPageProviderOwnership(label, source);
}

assert(manifestSource.includes('permissions.push("identity")') &&
  manifestSource.includes('const oauthGoogleEnabled = oauthProvider === "google"'),
  "manifest generation must add chrome identity permission only for explicit Google OAuth builds");
assert(buildSource.includes("H2O_IDENTITY_OAUTH_PROVIDER") &&
  buildSource.includes("IDENTITY_PROVIDER_OAUTH_GOOGLE") &&
  buildSource.includes('oauthProviders: valid && oauthProvider === IDENTITY_PROVIDER_OAUTH_GOOGLE ? ["google"] : []'),
  "build must gate Google OAuth capability on H2O_IDENTITY_OAUTH_PROVIDER=google");
assert(!manifestPermissions(DEFAULT_MANIFEST_REL).includes("identity"),
  "default controls manifest must not include identity permission");
assert(!manifestPermissions(PROD_MANIFEST_REL).includes("identity"),
  "production manifest must not include identity permission unless explicitly OAuth-enabled");
if (exists(OAUTH_MANIFEST_REL)) {
  assert(manifestPermissions(OAUTH_MANIFEST_REL).includes("identity"),
    "OAuth-enabled manifest must include identity permission");
}

const markOAuthSql = extractFunction(oauthMigration, "mark_oauth_credential_completed");
const loadIdentitySql = extractFunction(oauthMigration, "load_identity_state");
assert(oauthMigration.includes("create table if not exists public.identity_oauth_status") &&
  oauthMigration.includes("alter table public.identity_oauth_status force row level security") &&
  /revoke\s+all\s+on\s+table\s+public\.identity_oauth_status\s+from\s+anon\s*,\s*authenticated\s*,\s*public/i.test(oauthMigration),
  "OAuth status table must be forced-RLS and not directly writable by normal roles");
assert(markOAuthSql.includes("security definer") &&
  markOAuthSql.includes("auth.uid()") &&
  markOAuthSql.includes("v_provider <> 'google'") &&
  markOAuthSql.includes("'credential_provider', v_provider"),
  "mark_oauth_credential_completed must be authenticated SECURITY DEFINER and Google-only");
assert(loadIdentitySql.includes("identity_password_status") &&
  loadIdentitySql.includes("identity_oauth_status") &&
  loadIdentitySql.includes("'credential_state'") &&
  loadIdentitySql.includes("'credential_provider'") &&
  loadIdentitySql.includes("'multiple'") &&
  loadIdentitySql.includes("'google'") &&
  loadIdentitySql.includes("'password'") &&
  !/'owner_user_id'|'deleted_at'/.test(loadIdentitySql),
  "load_identity_state must derive safe credentialState/provider from password OR Google OAuth status only");
assert(schemaValidator.includes("identity_oauth_status") &&
  schemaValidator.includes("mark_oauth_credential_completed"),
  "schema validator must cover OAuth status table and RPC");

assert(docs.includes("Phase 3.9B - Google OAuth") &&
  docs.includes('chrome.identity.getRedirectURL("identity/oauth/google")') &&
  docs.includes("https://<extension-id>.chromiumapp.org/identity/oauth/google") &&
  docs.includes("Supabase Auth Redirect URLs") &&
  docs.includes("Authorized redirect URI must be Supabase callback") &&
  docs.includes("provider_token") &&
  docs.includes("provider_refresh_token") &&
  docs.includes("Account linking remains deferred") &&
  docs.includes("Microsoft/GitHub/Apple remain deferred"),
  "docs must record the Google OAuth redirect/dashboard/security boundaries");
assert(releaseRunner.includes("H2O_IDENTITY_OAUTH_PROVIDER") &&
  releaseRunner.includes("build/chrome-ext-dev-controls-oauth-google") &&
  releaseRunner.includes("tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs"),
  "release runner must include the OAuth-enabled build and 3.9B validator");

console.log("Identity Phase 3.9B Google OAuth validation passed.");
