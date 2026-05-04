// Identity Phase 4.0B validation - Account & Security MVP.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const MIGRATION_REL = "supabase/migrations/202605020001_identity_account_security_mvp.sql";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function extractFunction(source, name) {
  const sqlStart = source.indexOf(`create or replace function public.${name}`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const syncStart = source.indexOf(`function ${name}(`);
  const jsStart = asyncStart >= 0 && (syncStart < 0 || asyncStart < syncStart) ? asyncStart : syncStart;
  const start = sqlStart >= 0 && (jsStart < 0 || sqlStart < jsStart) ? sqlStart : jsStart;
  if (start < 0) return "";
  const jsArgsEnd = jsStart >= 0 && start === jsStart ? source.indexOf(")", start) : -1;
  const bodyStart = source.indexOf("{", jsArgsEnd >= 0 ? jsArgsEnd : start);
  const sqlBodyStart = source.indexOf("$$", start);
  if (sqlBodyStart >= 0 && (bodyStart < 0 || sqlBodyStart < bodyStart)) {
    const sqlBodyEnd = source.indexOf("$$", sqlBodyStart + 2);
    if (sqlBodyEnd > sqlBodyStart) return source.slice(start, sqlBodyEnd + 2);
  }
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
    `${label}: must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: must not import or probe provider bundle`);
  assert(!/\.rpc\s*\(/.test(source),
    `${label}: must not call Supabase RPC`);
  assert(!/\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships|identity_password_status|identity_oauth_status)['"`]/.test(source),
    `${label}: must not call Supabase tables`);
  assert(!/\b(service_role|service-role|serviceRoleKey)\b/i.test(source),
    `${label}: must not contain service-role strings`);
  assert(!/\b(access_token|refresh_token|rawSession|rawUser|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not contain token/session/raw-user or unsafe DB fields`);
}

function assertNoPasswordPersistence(label, source) {
  assert(!/(localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*password/i.test(source),
    `${label}: password must not be written to or read from page storage`);
  assert(!/chrome\.storage\.(?:local|session)[\s\S]{0,120}password/i.test(source),
    `${label}: password must not be written to chrome storage`);
  assert(!/password[\s\S]{0,120}(console\.(?:log|warn|error|info)|diagnostics?\s*:|audit\s*:)/i.test(source),
    `${label}: password must not appear in logs, diagnostics, or audit payloads`);
}

console.log("\n-- Identity Phase 4.0B account/security MVP validation -----------");

const docs = read(DOC_REL);
const migration = read(MIGRATION_REL);
const provider = read(PROVIDER_REL);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.0B - Account & Security MVP") &&
  docs.includes("Account/Security settings surface skeleton") &&
  docs.includes("current_password") &&
  docs.includes("password_account_change") &&
  docs.includes("Add password is deferred"),
  "docs must document the Phase 4.0B account/security MVP boundaries");
assert(docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must list the 4.0B validator and syntax command");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the 4.0B validator");

const markPassword = extractFunction(migration, "mark_password_setup_completed");
assert(markPassword.includes("security definer") &&
  markPassword.includes("set search_path = public") &&
  markPassword.includes("auth.uid()") &&
  markPassword.includes("password_account_change") &&
  markPassword.includes("'credential_state'") &&
  markPassword.includes("'complete'"),
  "mark_password_setup_completed must remain a safe authenticated SECURITY DEFINER RPC and allow password_account_change");
assert(/revoke\s+all\s+on\s+function\s+public\.mark_password_setup_completed\s*\(\s*text\s*\)\s+from\s+anon\s*,\s*public/i.test(migration) &&
  /grant\s+execute\s+on\s+function\s+public\.mark_password_setup_completed\s*\(\s*text\s*\)\s+to\s+authenticated/i.test(migration),
  "mark_password_setup_completed grants must deny anon/public and allow authenticated");

const updateProfileSql = extractFunction(migration, "update_identity_profile");
assert(updateProfileSql.includes("security definer") &&
  updateProfileSql.includes("set search_path = public") &&
  updateProfileSql.includes("auth.uid()") &&
  /(?:char_)?length\s*\(\s*v_display_name\s*\)\s*<\s*1[\s\S]*?(?:char_)?length\s*\(\s*v_display_name\s*\)\s*>\s*64/i.test(updateProfileSql) &&
  updateProfileSql.includes("v_avatar_color !~ '^[a-z0-9][a-z0-9_-]{0,31}$'") &&
  updateProfileSql.includes("where id = v_uid") &&
  updateProfileSql.includes("deleted_at is null") &&
  updateProfileSql.includes("'profile'"),
  "update_identity_profile must validate input, derive auth.uid(), update only the caller profile, and return a safe profile DTO");
assert(!/p_user_id|p_profile_id|auth\.users|provider_id|provider_token|identities|to_jsonb\s*\(|row_to_json\s*\(|\*\s+from/i.test(updateProfileSql),
  "update_identity_profile must not accept caller IDs or expose raw/private rows");
assert(!/'(?:email|deleted_at|owner_user_id|access_token|refresh_token|raw_user|raw_session)'/i.test(updateProfileSql),
  "update_identity_profile return DTO must not include unsafe fields");
assert(/revoke\s+all\s+on\s+function\s+public\.update_identity_profile\s*\(\s*text\s*,\s*text\s*\)\s+from\s+anon\s*,\s*public/i.test(migration) &&
  /grant\s+execute\s+on\s+function\s+public\.update_identity_profile\s*\(\s*text\s*,\s*text\s*\)\s+to\s+authenticated/i.test(migration),
  "update_identity_profile grants must deny anon/public and allow authenticated");

const renameWorkspaceSql = extractFunction(migration, "rename_identity_workspace");
assert(renameWorkspaceSql.includes("security definer") &&
  renameWorkspaceSql.includes("set search_path = public") &&
  renameWorkspaceSql.includes("auth.uid()") &&
  /(?:char_)?length\s*\(\s*v_workspace_name\s*\)\s*<\s*1[\s\S]*?(?:char_)?length\s*\(\s*v_workspace_name\s*\)\s*>\s*64/i.test(renameWorkspaceSql) &&
  renameWorkspaceSql.includes("workspace_memberships") &&
  renameWorkspaceSql.includes("wm.user_id = v_uid") &&
  renameWorkspaceSql.includes("wm.role = 'owner'") &&
  renameWorkspaceSql.includes("owned.owner_user_id = v_uid") &&
  renameWorkspaceSql.includes("w.deleted_at is null") &&
  renameWorkspaceSql.includes("'workspace'") &&
  renameWorkspaceSql.includes("'role', 'owner'"),
  "rename_identity_workspace must validate input, derive auth.uid(), update only caller-owned workspace, and return a safe DTO");
assert(!/p_user_id|p_workspace_id|auth\.users|provider_id|provider_token|identities|to_jsonb\s*\(|row_to_json\s*\(|\*\s+from/i.test(renameWorkspaceSql),
  "rename_identity_workspace must not accept caller IDs or expose raw/private rows");
assert(!/'(?:email|deleted_at|owner_user_id|access_token|refresh_token|membership_id|raw_user|raw_session)'/i.test(renameWorkspaceSql),
  "rename_identity_workspace return DTO must not include unsafe fields");
assert(/revoke\s+all\s+on\s+function\s+public\.rename_identity_workspace\s*\(\s*text\s*\)\s+from\s+anon\s*,\s*public/i.test(migration) &&
  /grant\s+execute\s+on\s+function\s+public\.rename_identity_workspace\s*\(\s*text\s*\)\s+to\s+authenticated/i.test(migration),
  "rename_identity_workspace grants must deny anon/public and allow authenticated");

const changePasswordProvider = extractFunction(provider, "changePassword");
assert(changePasswordProvider.includes("normalizeProviderSignOutSession(rawSession)") &&
  changePasswordProvider.includes("createEphemeralProviderStorage(safeSession)") &&
  changePasswordProvider.includes("persistSession: true") &&
  changePasswordProvider.includes("autoRefreshToken: false") &&
  changePasswordProvider.includes("detectSessionInUrl: false") &&
  changePasswordProvider.includes("client.auth.updateUser({") &&
  changePasswordProvider.includes("current_password: currentPassword") &&
  !changePasswordProvider.includes("currentPassword:") &&
  !/return\s+\{[\s\S]*rawSession\s*:/.test(changePasswordProvider) &&
  !/return\s+\{[\s\S]*user\s*:/.test(changePasswordProvider),
  "provider changePassword must use helper-local auth storage, installed current_password casing, and return no raw session/user");
const updateUserMatches = provider.match(/\bupdateUser\s*\(/g) || [];
assert(updateUserMatches.length === 2 &&
  extractFunction(provider, "updatePasswordAfterRecovery").includes("client.auth.updateUser({ password })"),
  "provider may call updateUser only for recovery set-password and signed-in password change");
assert(!/\bclient\.auth\.updateUser\s*\(|\bupdateUser\s*\(/.test(background + loader + identityCore + identitySurfaceJs + controlHubAccountSurface),
  "background/page/UI/loader/Control Hub Account surface must not call Supabase updateUser directly");

const updateProfileProvider = extractFunction(provider, "updateIdentityProfile");
assert(updateProfileProvider.includes('client.rpc("update_identity_profile"') &&
  updateProfileProvider.includes("Authorization: `Bearer ${accessToken}`") &&
  updateProfileProvider.includes("normalizeProviderProfileUpdateResult") &&
  !/to_jsonb|row_to_json|owner_user_id|deleted_at/.test(updateProfileProvider) &&
  !/return\s+\{[\s\S]*rawSession\s*:/.test(updateProfileProvider) &&
  !/return\s+\{[\s\S]*rawUser\s*:/.test(updateProfileProvider),
  "provider updateIdentityProfile must call only the approved RPC and return a safe profile DTO");
const renameWorkspaceProvider = extractFunction(provider, "renameIdentityWorkspace");
assert(renameWorkspaceProvider.includes('client.rpc("rename_identity_workspace"') &&
  renameWorkspaceProvider.includes("Authorization: `Bearer ${accessToken}`") &&
  renameWorkspaceProvider.includes("normalizeProviderWorkspaceRenameResult") &&
  !/to_jsonb|row_to_json|owner_user_id|deleted_at/.test(renameWorkspaceProvider) &&
  !/return\s+\{[\s\S]*rawSession\s*:/.test(renameWorkspaceProvider) &&
  !/return\s+\{[\s\S]*rawUser\s*:/.test(renameWorkspaceProvider),
  "provider renameIdentityWorkspace must call only the approved RPC and return a safe workspace DTO");
assert((provider.match(/\.rpc\s*\(/g) || []).length === 7,
  "provider source must keep RPC calls limited to the approved identity helpers");
assert(!/\.from\s*\(/.test(provider), "provider must not use direct table access");

for (const action of [
  "identity:update-profile",
  "identity:rename-workspace",
  "identity:change-password",
]) {
  assert(background.includes(`action === "${action}"`), `background bridge action missing: ${action}`);
  assert(loader.includes(`"${action}"`), `loader allowlist missing: ${action}`);
}
for (const marker of [
  "updateIdentityProfileRunner",
  "renameIdentityWorkspaceRunner",
  "changePasswordRunner",
  "identityAuthManager_updateProfile",
  "identityAuthManager_renameWorkspace",
  "identityAuthManager_changePassword",
  "identityAuthManager_readFreshProviderSessionForAccountUpdate",
]) {
  assert(background.includes(marker), `background must own account/security bridge path: ${marker}`);
}
const changePasswordBackground = extractFunction(background, "identityAuthManager_changePassword");
assert(changePasswordBackground.includes('credentialProvider !== "password" && credentialProvider !== "multiple"') &&
  changePasswordBackground.includes("identityProviderBundle_changePassword") &&
  changePasswordBackground.includes('"password_account_change"') &&
  changePasswordBackground.includes("identityProviderCredentialState_markCompleteForSession") &&
  changePasswordBackground.includes("identityProviderSession_publishSafeRuntime"),
  "background change-password path must require password-backed credentials, provider-owned update, credential RPC completion, and safe runtime publish");
assert(!/\bclient\.auth\.|\bProviderSdk\.|@supabase\/supabase-js/.test(background),
  "background must not call Supabase SDK directly");

for (const method of [
  "updateProfile",
  "renameWorkspace",
  "changePassword",
]) {
  assert(identityCore.includes(method), `Identity Core facade missing ${method}`);
}
assert(identityCore.includes("sendBridgeRaw('identity:update-profile'") &&
  identityCore.includes("sendBridgeRaw('identity:rename-workspace'") &&
  identityCore.includes("sendBridgeRaw('identity:change-password'") &&
  identityCore.includes("normalizePasswordInput") &&
  identityCore.includes("identity/password-current-invalid"),
  "Identity Core must expose only bridge/facade account-security methods and safe password-change errors");

assert(controlHubAccount.includes("Account & Security") &&
  controlHubAccount.includes("renderSecuritySettings") &&
  controlHubAccount.includes("Save profile") &&
  controlHubAccount.includes("Rename workspace") &&
  controlHubAccount.includes("Change password") &&
  controlHubAccount.includes("Current password") &&
  controlHubAccount.includes("Confirm new password") &&
  controlHubAccount.includes("PASSWORD_CHANGE_FEEDBACK") &&
  controlHubAccount.includes("applyPasswordChangeFeedback(status)") &&
  controlHubAccount.includes("Password changed.") &&
  controlHubAccount.includes("Google sign-in is connected. Add password is deferred.") &&
  controlHubAccount.includes("api.updateProfile") &&
  controlHubAccount.includes("api.renameWorkspace") &&
  controlHubAccount.includes("api.changePassword"),
  "Control Hub Account plugin must contain the Account/Security MVP skeleton and credential-aware password form");
assert(controlHubAccount.includes("key: 'account'") &&
  controlHubAccount.includes("getControls") &&
  controlHubAccount.includes("cssText: accountCssText"),
  "Control Hub Account plugin must register the existing Account tab via the plugin API");
assert(controlHubAccount.includes("openSubscriptionModal({ source: 'control-hub' })"),
  "Control Hub Account plugin must keep billing as the unchanged Control Hub pass-through");
assert(!controlHub.includes("CHUB_ACCOUNT_renderSecuritySettings") &&
  !controlHub.includes("api.changePassword") &&
  !controlHub.includes("accountSecuritySettings") &&
  !controlHub.includes("acctSecurity"),
  "Control Hub core must no longer own the Account/Security rendering block");

for (const [label, source] of [
  ["Identity Core", identityCore],
  ["identity.js", identitySurfaceJs],
  ["identity.html", identitySurfaceHtml],
  ["Control Hub", controlHub],
  ["Control Hub Account plugin", controlHubAccount],
  ["loader", loader],
]) {
  assertNoPageProviderOwnership(label, source);
  assertNoPasswordPersistence(label, source);
}

assert(!/\bprovider_token\b|\bprovider_refresh_token\b/.test(identityCore + identitySurfaceJs + controlHubAccountSurface + loader),
  "4.0B page/UI/loader surfaces must not expose OAuth provider tokens");
assert(background.includes("IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY") &&
  !/chrome\.storage\.local[\s\S]{0,160}access_token/i.test(background),
  "persistent storage must remain Supabase refresh-token only with no access-token local persistence");
assert(!/signOutEverywhere|deleteAccount|unlinkCredential|resetLink|recovery-token|signInWithIdToken|getAuthToken/i.test(provider + background + identityCore + identitySurfaceJs + controlHubAccountSurface),
  "4.0B must not add deferred account deletion, unlinking, reset-link, ID-token, or getAuthToken features");

console.log("  account/security SQL RPCs are safe and auth.uid-owned");
console.log("  provider/background/facade ownership boundaries hold");
console.log("  Control Hub Account/Security MVP surface is present");
console.log("  password/token/session leak checks passed");
console.log("\nIdentity Phase 4.0B account/security MVP validation PASSED");
