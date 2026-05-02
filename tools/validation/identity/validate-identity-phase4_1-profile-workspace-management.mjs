// Identity Phase 4.1 validation - Profile + Workspace Management polish.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const MIGRATION_REL = "supabase/migrations/202605020001_identity_account_security_mvp.sql";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_1-profile-workspace-management.mjs";

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
  const sqlBodyStart = source.indexOf("$$", start);
  const jsArgsEnd = jsStart >= 0 && start === jsStart ? source.indexOf(")", start) : -1;
  const jsBodyStart = source.indexOf("{", jsArgsEnd >= 0 ? jsArgsEnd : start);
  if (sqlBodyStart >= 0 && (jsBodyStart < 0 || sqlBodyStart < jsBodyStart)) {
    const sqlBodyEnd = source.indexOf("$$", sqlBodyStart + 2);
    if (sqlBodyEnd > sqlBodyStart) return source.slice(start, sqlBodyEnd + 2);
  }
  if (jsBodyStart < 0) return "";
  let depth = 0;
  for (let index = jsBodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function assertNoUnsafeSurface(label, source) {
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: UI/facade/loader must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: UI/facade/loader must not import or probe the provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: UI/facade/loader must not call Supabase directly`);
  assert(!/\b(access_token|refresh_token|rawSession|rawUser|owner_user_id|deleted_at|service_role|service-role|serviceRoleKey)\b/i.test(source),
    `${label}: must not expose token/session/raw-user, service-role, or unsafe DB fields`);
}

console.log("\n-- Identity Phase 4.1 profile/workspace management validation ----");

const migration = read(MIGRATION_REL);
const provider = read(PROVIDER_REL);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const accountPlugin = read(CONTROL_HUB_ACCOUNT_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.1 profile/workspace validator");

const updateProfileSql = extractFunction(migration, "update_identity_profile");
assert(updateProfileSql.includes("security definer") &&
  updateProfileSql.includes("set search_path = public") &&
  updateProfileSql.includes("auth.uid()") &&
  /(?:char_)?length\s*\(\s*v_display_name\s*\)\s*<\s*1[\s\S]*?(?:char_)?length\s*\(\s*v_display_name\s*\)\s*>\s*64/i.test(updateProfileSql) &&
  updateProfileSql.includes("v_avatar_color !~ '^[a-z0-9][a-z0-9_-]{0,31}$'") &&
  updateProfileSql.includes("where id = v_uid") &&
  updateProfileSql.includes("deleted_at is null"),
  "update_identity_profile must keep authenticated auth.uid-owned validation and safe row targeting");

const renameWorkspaceSql = extractFunction(migration, "rename_identity_workspace");
assert(renameWorkspaceSql.includes("security definer") &&
  renameWorkspaceSql.includes("set search_path = public") &&
  renameWorkspaceSql.includes("auth.uid()") &&
  /(?:char_)?length\s*\(\s*v_workspace_name\s*\)\s*<\s*1[\s\S]*?(?:char_)?length\s*\(\s*v_workspace_name\s*\)\s*>\s*64/i.test(renameWorkspaceSql) &&
  renameWorkspaceSql.includes("workspace_memberships") &&
  renameWorkspaceSql.includes("wm.user_id = v_uid") &&
  renameWorkspaceSql.includes("wm.role = 'owner'") &&
  renameWorkspaceSql.includes("owned.owner_user_id = v_uid"),
  "rename_identity_workspace must keep authenticated owner-only validation and workspace targeting");

for (const [name, block] of [
  ["update_identity_profile", updateProfileSql],
  ["rename_identity_workspace", renameWorkspaceSql],
]) {
  assert(!/p_user_id|p_profile_id|p_workspace_id|auth\.users|provider_token|to_jsonb\s*\(|row_to_json\s*\(|\*\s+from/i.test(block),
    `${name}: must not accept caller IDs or expose raw/private rows`);
  assert(!/'(?:email|deleted_at|owner_user_id|access_token|refresh_token|raw_user|raw_session)'/i.test(block),
    `${name}: return DTO must not include unsafe fields`);
}

assert(accountPlugin.includes("const ACCOUNT_TEXT_MAX = 64") &&
  accountPlugin.includes("const ACCOUNT_AVATAR_MAX = 32") &&
  accountPlugin.includes("const ACCOUNT_AVATAR_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/") &&
  accountPlugin.includes("validateProfileForm") &&
  accountPlugin.includes("validateWorkspaceForm") &&
  accountPlugin.includes("validateAvatarColor"),
  "Account plugin must mirror RPC profile/workspace validation limits before bridge calls");
assert(accountPlugin.includes("save.disabled = inFlight || !dirty || !validation.ok") &&
  (accountPlugin.match(/if \(inFlight\) return/g) || []).length >= 2 &&
  accountPlugin.includes("Saving profile...") &&
  accountPlugin.includes("Renaming workspace..."),
  "Account plugin must disable saves unless dirty/valid and block double-submit while in-flight");
assert(accountPlugin.includes("Profile updated.") &&
  accountPlugin.includes("Workspace renamed.") &&
  accountPlugin.includes("Could not update profile.") &&
  accountPlugin.includes("Could not rename workspace.") &&
  accountPlugin.includes("setAccountFeedback('profile'") &&
  accountPlugin.includes("setAccountFeedback('workspace'") &&
  accountPlugin.includes("applyAccountFeedback"),
  "Account plugin must show persistent safe success/error feedback for profile and workspace edits");
assert(accountPlugin.includes("displayName: validation.displayName") &&
  accountPlugin.includes("avatarColor: validation.avatarColor") &&
  accountPlugin.includes("workspaceName: validation.workspaceName"),
  "Account plugin must submit trimmed/validated values to the facade");
assert(accountPlugin.includes("status.setAttribute('aria-live', 'polite')"),
  "Account plugin must expose account edit feedback through polite live status text");

const updateProfileProvider = extractFunction(provider, "updateIdentityProfile");
const renameWorkspaceProvider = extractFunction(provider, "renameIdentityWorkspace");
assert(updateProfileProvider.includes('client.rpc("update_identity_profile"') &&
  updateProfileProvider.includes("normalizeProviderProfileUpdateResult"),
  "provider must keep profile edits provider-owned through update_identity_profile RPC");
assert(renameWorkspaceProvider.includes('client.rpc("rename_identity_workspace"') &&
  renameWorkspaceProvider.includes("normalizeProviderWorkspaceRenameResult"),
  "provider must keep workspace renames provider-owned through rename_identity_workspace RPC");
assert(!/\.from\s*\(/.test(provider), "provider must not use direct table access for account management");

const updateProfileBackground = extractFunction(background, "identityAuthManager_updateProfile");
const renameWorkspaceBackground = extractFunction(background, "identityAuthManager_renameWorkspace");
assert(updateProfileBackground.includes("identityProviderSession_publishSafeRuntime(nextRuntime, true") &&
  updateProfileBackground.includes("identityProviderOnboarding_sanitizeProfile(runtime.profile)") &&
  updateProfileBackground.includes("identityProviderOnboarding_sanitizeWorkspace(runtime.workspace)"),
  "background profile update must publish fresh safe runtime and return sanitized identity state");
assert(renameWorkspaceBackground.includes("identityProviderSession_publishSafeRuntime(nextRuntime, true") &&
  renameWorkspaceBackground.includes("identityProviderOnboarding_sanitizeProfile(runtime.profile)") &&
  renameWorkspaceBackground.includes("identityProviderOnboarding_sanitizeWorkspace(runtime.workspace)"),
  "background workspace rename must publish fresh safe runtime and return sanitized identity state");

assert(identityCore.includes("sendBridgeRaw('identity:update-profile'") &&
  identityCore.includes("sendBridgeRaw('identity:rename-workspace'") &&
  identityCore.includes("applyPasswordAuthBridgeState('updateProfile'") &&
  identityCore.includes("applyPasswordAuthBridgeState('renameWorkspace'"),
  "Identity Core must keep profile/workspace edits facade-only and apply safe bridge state");
assert(loader.includes('"identity:update-profile"') &&
  loader.includes('"identity:rename-workspace"'),
  "loader bridge allowlist must include profile/workspace account actions");

for (const [label, source] of [
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["loader", loader],
]) {
  assertNoUnsafeSurface(label, source);
}

assert(!/console\.(?:log|warn|error|info)\([^)]*(displayName|avatarColor|workspaceName|profile|workspace)/i.test(accountPlugin + identityCore + background),
  "profile/workspace payloads must not be logged from UI/facade/background paths");

console.log("  profile/workspace client validation mirrors RPC limits");
console.log("  dirty-state, in-flight, and safe feedback checks passed");
console.log("  provider/background/facade ownership boundaries hold");
console.log("  safe runtime refresh and leak checks passed");
console.log("\nIdentity Phase 4.1 profile/workspace management validation PASSED");
