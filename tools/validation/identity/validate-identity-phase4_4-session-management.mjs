// Identity Phase 4.4 validation - Session & Device Management.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const ACCOUNT_PLUGIN_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_4-session-management.mjs";
const MIGRATIONS_DIR_REL = "supabase/migrations";

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

function assertNoUiLeak(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at|IDENTITY_PROVIDER_SESSION_KEY|IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY)\b/.test(source),
    `${label}: must not expose token/session storage internals, raw auth data, or unsafe DB fields`);
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: must not import/probe provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: must not call Supabase directly`);
}

console.log("\n-- Identity Phase 4.4 session management validation -------------");

const docs = read(DOC_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);
const migrationSources = fs.readdirSync(path.join(REPO_ROOT, MIGRATIONS_DIR_REL))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => read(path.join(MIGRATIONS_DIR_REL, name)))
  .join("\n");

assert(docs.includes("Phase 4.4B - Session UX + Release Gate") &&
  docs.includes("current-browser controls only") &&
  docs.includes("Sign out everywhere") &&
  docs.includes("Manage devices") &&
  docs.includes("Deferred") &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must document Phase 4.4B current-browser session policy and validator commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.4 session management validator");

const renderIdentitySectionBody = extractFunction(accountPlugin, "renderIdentitySectionBody");
const renderSessionManagementSettings = extractFunction(accountPlugin, "renderSessionManagementSettings");
assert(renderIdentitySectionBody.includes("key === 'session'") &&
  renderIdentitySectionBody.includes("renderSessionManagementSettings(ctx)"),
  "Identity Session subtab must render the dedicated session management section");
assert(renderSessionManagementSettings.includes("'This browser'") &&
  renderSessionManagementSettings.includes("Current-browser session controls") &&
  renderSessionManagementSettings.includes("Persistent sign-in") &&
  renderSessionManagementSettings.includes("Sign out of this browser") &&
  renderSessionManagementSettings.includes("Refresh Identity") &&
  renderSessionManagementSettings.includes("Sign out everywhere") &&
  renderSessionManagementSettings.includes("Deferred. No cross-device sign-out action is implemented.") &&
  renderSessionManagementSettings.includes("Manage devices") &&
  renderSessionManagementSettings.includes("Deferred. This release does not keep or display a device list."),
  "Session UI must clearly expose current-browser controls and deferred global/device management copy");
assert(renderSessionManagementSettings.includes("renderInfoList(rows)") &&
  renderSessionManagementSettings.includes("ctx.diag?.status || ctx.snap?.status") &&
  renderSessionManagementSettings.includes("ctx.profile?.displayName") &&
  renderSessionManagementSettings.includes("ctx.workspace?.name"),
  "Session UI must derive status/profile/workspace summary from safe public identity context only");
assert(!/\{\s*label:\s*['"`](?:Sign out everywhere|Manage devices)['"`][\s\S]{0,120}\baction\s*:/.test(renderSessionManagementSettings),
  "Sign out everywhere and Manage devices must not be wired as action buttons");

const runtimeSources = [accountPlugin, background, provider, loader, identityCore, identitySurfaceJs, identitySurfaceHtml].join("\n");
assert(!/\bidentity:(?:sign-out-everywhere|sign-out-all|list-devices|manage-devices|revoke-device|revoke-session)\b/i.test(runtimeSources),
  "no sign-out-everywhere or device-management bridge action may be introduced");
assert(!/\b(signOutEverywhere|signOutAll|listDevices|manageDevices|revokeDevice|revokeSession|deviceManagement)\b/.test(runtimeSources),
  "no sign-out-everywhere or device-management runtime helper may be introduced");
assert(!/\b(identity_devices|identity_device_sessions|device_sessions|session_devices)\b/i.test(migrationSources + "\n" + runtimeSources),
  "no device/session management table or runtime model may be introduced in Phase 4.4B");

const providerSignOut = extractFunction(provider, "signOutProviderSession");
assert(providerSignOut.includes('client.auth.signOut({ scope: "local" })') &&
  !/scope:\s*["'](?:global|others)["']/.test(providerSignOut),
  "provider sign-out must remain local-scope only");
assert(!/scope:\s*["'](?:global|others)["']/.test(background + "\n" + provider),
  "current runtime must not add global or others sign-out scope");

const signOutCleanup = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
assert(signOutCleanup.includes("identityAuthManager_clearRuntime()") &&
  signOutCleanup.includes("identityAuthManager_clearStoredSnapshot()") &&
  signOutCleanup.includes("providerSessionRemove([IDENTITY_PROVIDER_SESSION_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY])") &&
  signOutCleanup.includes("providerPersistentRefreshRemove([IDENTITY_PROVIDER_PASSWORD_UPDATE_REQUIRED_KEY])") &&
  signOutCleanup.includes("storageSessionRemove([IDENTITY_PROVIDER_OAUTH_FLOW_KEY])") &&
  signOutCleanup.includes("broadcastIdentityPush(null)"),
  "sign-out cleanup must clear runtime, snapshot, active session, persistent refresh, password marker, OAuth transient state, and broadcast reset");

const persistentRecord = extractFunction(background, "identityProviderPersistentRefresh_buildRecordResult");
assert(persistentRecord.includes("refresh_token: refreshToken") &&
  persistentRecord.includes("projectOrigin: context.projectOrigin") &&
  !/\baccess_token\b|\bprovider_token\b|\bprovider_refresh_token\b|rawSession\s*:|rawUser\s*:/.test(persistentRecord),
  "persistent refresh record must remain refresh-token-only plus safe metadata");

for (const [label, source] of [
  ["Control Hub Account plugin", accountPlugin],
  ["Identity Core", identityCore],
  ["loader", loader],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
]) {
  assertNoUiLeak(label, source);
}

console.log("  current-browser Session UI copy is present");
console.log("  sign-out-everywhere and device management remain deferred/inert");
console.log("  provider sign-out remains local-scope only");
console.log("  sign-out cleanup and persistent refresh boundaries passed");
console.log("  UI/page/loader leak checks passed");
console.log("\nIdentity Phase 4.4 session management validation PASSED");
