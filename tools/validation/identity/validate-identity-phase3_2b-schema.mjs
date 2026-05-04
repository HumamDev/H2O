// Identity Phase 3.2B validation — Supabase profile/workspace schema and RLS.
// This validator is intentionally static-only. It verifies the migration SQL
// boundary and confirms no extension runtime code starts calling profile/workspace
// database APIs in this phase.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATION_REL = "supabase/migrations/202604300001_identity_profile_workspace_rls.sql";
const LOAD_IDENTITY_MIGRATION_REL = "supabase/migrations/202605010001_identity_load_identity_state.sql";
const PASSWORD_STATUS_MIGRATION_REL = "supabase/migrations/202605010003_identity_password_status.sql";
const LOAD_IDENTITY_CREDENTIAL_FIX_REL = "supabase/migrations/202605010004_identity_load_identity_state_credential_gate_fix.sql";
const OAUTH_STATUS_MIGRATION_REL = "supabase/migrations/202605010005_identity_google_oauth_status.sql";
const ACCOUNT_SECURITY_MVP_REL = "supabase/migrations/202605020001_identity_account_security_mvp.sql";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs"]);
const EXTENSION_RUNTIME_RELS = [
  "tools/product/extension/chrome-live-background.mjs",
  "tools/product/extension/chrome-live-loader.mjs",
  "tools/dev-controls/popup/chrome-live-popup-html.mjs",
  "tools/dev-controls/popup/chrome-live-popup-js.mjs",
  "tools/dev-controls/popup/chrome-live-popup-view.mjs",
  "tools/product/identity/identity-provider-supabase.entry.mjs",
];
const EXTENSION_RUNTIME_DIRS = [
  "scripts",
  "surfaces/identity",
];

function abs(rel) {
  return path.join(REPO_ROOT, rel);
}

function toRel(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

function read(rel) {
  return fs.readFileSync(abs(rel), "utf8");
}

function readAbs(file) {
  return fs.readFileSync(file, "utf8");
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function normalizeSql(source) {
  return source
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(file);
      } else if (entry.isFile()) {
        out.push(file);
      }
    }
  }
  return out.sort();
}

function runtimeFiles() {
  const files = new Set();
  for (const rel of EXTENSION_RUNTIME_RELS) {
    if (exists(rel)) files.add(abs(rel));
  }
  for (const rel of EXTENSION_RUNTIME_DIRS) {
    for (const file of listFiles(abs(rel))) {
      if (TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) files.add(file);
    }
  }
  return [...files].sort();
}

function extractCreateTable(sql, tableName) {
  const pattern = new RegExp(
    `create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`,
    "i",
  );
  const match = sql.match(pattern);
  assert(match, `migration must create public.${tableName}`);
  return match[1];
}

function extractFunction(sql, functionName) {
  const marker = `create or replace function public.${functionName}`;
  const start = sql.toLowerCase().indexOf(marker);
  assert(start >= 0, `migration must create public.${functionName}()`);
  const end = sql.indexOf("$$;", start);
  assert(end > start, `public.${functionName}() body must terminate with $$;`);
  return sql.slice(start, end + 3);
}

function assertContains(label, source, pattern) {
  assert(pattern.test(source), `${label} missing required pattern: ${pattern}`);
}

function assertNotContains(label, source, pattern) {
  assert(!pattern.test(source), `${label} contains forbidden pattern: ${pattern}`);
}

function assertTableColumns(sql) {
  const profiles = extractCreateTable(sql, "profiles");
  assertContains("profiles", profiles, /\bid\s+uuid\s+primary\s+key\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  assertContains("profiles", profiles, /\bdisplay_name\s+text\s+not\s+null/i);
  assertContains("profiles", profiles, /\bavatar_color\s+text\s+not\s+null/i);
  assertContains("profiles", profiles, /\bonboarding_completed\s+boolean\s+not\s+null\s+default\s+false/i);
  assertContains("profiles", profiles, /\bcreated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i);
  assertContains("profiles", profiles, /\bupdated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i);
  assertContains("profiles", profiles, /\bdeleted_at\s+timestamptz\s+null/i);
  assertContains("profiles", profiles, /char_length\s*\(\s*btrim\s*\(\s*display_name\s*\)\s*\)\s+between\s+1\s+and\s+64/i);
  assertContains("profiles", profiles, /avatar_color\s*~\s*'\^\[a-z0-9\]\[a-z0-9_-\]\{0,31\}\$'/i);
  assertNotContains("profiles", profiles, /\bemail\b/i);

  const workspaces = extractCreateTable(sql, "workspaces");
  assertContains("workspaces", workspaces, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i);
  assertContains("workspaces", workspaces, /\bowner_user_id\s+uuid\s+not\s+null\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  assertContains("workspaces", workspaces, /\bname\s+text\s+not\s+null/i);
  assertContains("workspaces", workspaces, /\bdeleted_at\s+timestamptz\s+null/i);
  assertContains("workspaces", workspaces, /char_length\s*\(\s*btrim\s*\(\s*name\s*\)\s*\)\s+between\s+1\s+and\s+64/i);

  const memberships = extractCreateTable(sql, "workspace_memberships");
  assertContains("workspace_memberships", memberships, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/i);
  assertContains("workspace_memberships", memberships, /\bworkspace_id\s+uuid\s+not\s+null\s+references\s+public\.workspaces\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  assertContains("workspace_memberships", memberships, /\buser_id\s+uuid\s+not\s+null\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  assertContains("workspace_memberships", memberships, /\brole\s+text\s+not\s+null/i);
  assertContains("workspace_memberships", memberships, /role\s+in\s*\(\s*'owner'\s*\)/i);
  assertContains("workspace_memberships", memberships, /unique\s*\(\s*workspace_id\s*,\s*user_id\s*\)/i);
}

function assertIndexesTriggersAndRls(sql, normalized) {
  assertContains("migration", sql, /create\s+unique\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+public\.workspaces\s*\(\s*owner_user_id\s*\)\s+where\s+deleted_at\s+is\s+null/i);
  assertContains("migration", sql, /create\s+or\s+replace\s+function\s+public\.touch_updated_at\s*\(\s*\)/i);
  for (const table of ["profiles", "workspaces", "workspace_memberships"]) {
    assert(normalized.includes(`alter table public.${table} enable row level security`),
      `public.${table} must enable row level security`);
    assert(normalized.includes(`alter table public.${table} force row level security`),
      `public.${table} must force row level security`);
    assertContains(`public.${table}`, sql, new RegExp(`create\\s+trigger\\s+${table}_touch_updated_at[\\s\\S]*?on\\s+public\\.${table}[\\s\\S]*?execute\\s+function\\s+public\\.touch_updated_at\\s*\\(\\s*\\)`, "i"));
  }
}

function policyBlocks(sql) {
  return [...sql.matchAll(/create\s+policy\s+([a-z0-9_]+)[\s\S]*?;/gi)]
    .map((match) => ({ name: match[1], block: match[0] }));
}

function assertPolicies(sql) {
  const policies = policyBlocks(sql);
  const names = new Set(policies.map((policy) => policy.name));
  for (const name of [
    "profiles_select_own",
    "profiles_insert_own",
    "profiles_update_own",
    "workspaces_select_member",
    "workspaces_insert_owner",
    "workspaces_update_owner",
    "workspace_memberships_select_member",
    "workspace_memberships_insert_owner_self",
  ]) {
    assert(names.has(name), `missing RLS policy ${name}`);
  }
  assertNotContains("migration", sql, /create\s+policy[\s\S]*?for\s+delete/i);
  assertNotContains("migration", sql, /\busing\s*\(\s*true\s*\)/i);
  assertNotContains("migration", sql, /\bwith\s+check\s*\(\s*true\s*\)/i);
  for (const policy of policies) {
    assert(/auth\.uid\s*\(\s*\)|public\.is_workspace_(?:member|owner)\s*\(/i.test(policy.block),
      `policy ${policy.name} must guard with auth.uid() or approved workspace helper`);
  }
  assertContains("profiles_select_own", sql, /create\s+policy\s+profiles_select_own[\s\S]*?using\s*\(\s*id\s*=\s*auth\.uid\s*\(\s*\)\s*\)/i);
  assertContains("profiles_insert_own", sql, /create\s+policy\s+profiles_insert_own[\s\S]*?with\s+check\s*\(\s*id\s*=\s*auth\.uid\s*\(\s*\)\s*\)/i);
  assertContains("workspace_memberships_insert_owner_self", sql, /user_id\s*=\s*auth\.uid\s*\(\s*\)[\s\S]*?role\s*=\s*'owner'[\s\S]*?public\.is_workspace_owner\s*\(\s*workspace_id\s*\)/i);
}

function assertHelperFunction(sql, name) {
  const block = extractFunction(sql, name);
  assertContains(name, block, /returns\s+boolean/i);
  assertContains(name, block, /security\s+definer/i);
  assertContains(name, block, /set\s+search_path\s*=\s*public/i);
  assertContains(name, block, /auth\.uid\s*\(\s*\)/i);
  assertNotContains(name, block, /\buser_id\s+uuid\b/i);
  assertNotContains(name, block, /\breturns\s+(?:table|setof)\b/i);
  assertNotContains(name, block, /\breturn\s+query\b/i);
  assertContains(name, sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*uuid\\s*\\)\\s+from\\s+anon\\s*,\\s*public`, "i"));
  assertContains(name, sql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\(\\s*uuid\\s*\\)\\s+to\\s+authenticated`, "i"));
}

function assertCompleteOnboarding(sql) {
  const block = extractFunction(sql, "complete_onboarding");
  assertContains("complete_onboarding", block, /returns\s+jsonb/i);
  assertContains("complete_onboarding", block, /security\s+definer/i);
  assertContains("complete_onboarding", block, /set\s+search_path\s*=\s*public/i);
  assertContains("complete_onboarding", block, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("complete_onboarding", block, /if\s+v_uid\s+is\s+null[\s\S]*?raise\s+exception/i);
  assertContains("complete_onboarding", block, /insert\s+into\s+public\.profiles/i);
  assertContains("complete_onboarding", block, /insert\s+into\s+public\.workspaces/i);
  assertContains("complete_onboarding", block, /insert\s+into\s+public\.workspace_memberships/i);
  assertContains("complete_onboarding", block, /on\s+conflict/i);
  assertContains("complete_onboarding", block, /jsonb_build_object\s*\(/i);
  assertContains("complete_onboarding", sql, /revoke\s+all\s+on\s+function\s+public\.complete_onboarding\s*\(\s*text\s*,\s*text\s*,\s*text\s*\)\s+from\s+anon\s*,\s*public/i);
  assertContains("complete_onboarding", sql, /grant\s+execute\s+on\s+function\s+public\.complete_onboarding\s*\(\s*text\s*,\s*text\s*,\s*text\s*\)\s+to\s+authenticated/i);
  assertNotContains("complete_onboarding", block, /\b(access_token|refresh_token|id_token|provider_token|auth_code|otp_token_hash|service_role|service-role|serviceRoleKey)\b/i);
}

function assertLoadIdentityState(sql) {
  const block = extractFunction(sql, "load_identity_state");
  assertContains("load_identity_state", block, /returns\s+jsonb/i);
  assertContains("load_identity_state", block, /security\s+definer/i);
  assertContains("load_identity_state", block, /set\s+search_path\s*=\s*public/i);
  assertContains("load_identity_state", block, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("load_identity_state", block, /if\s+v_uid\s+is\s+null[\s\S]*?raise\s+exception/i);
  assertContains("load_identity_state", block, /from\s+public\.profiles/i);
  assertContains("load_identity_state", block, /from\s+public\.workspace_memberships/i);
  assertContains("load_identity_state", block, /join\s+public\.workspaces/i);
  assertContains("load_identity_state", block, /from\s+public\.identity_password_status/i);
  assertContains("load_identity_state", block, /'credential_state'/i);
  assertContains("load_identity_state", block, /coalesce\s*\(/i);
  assertContains("load_identity_state", block, /'required'/i);
  assertContains("load_identity_state", block, /jsonb_build_object\s*\(/i);
  assertContains("load_identity_state", sql, /revoke\s+all\s+on\s+function\s+public\.load_identity_state\s*\(\s*\)\s+from\s+anon\s*,\s*public/i);
  assertContains("load_identity_state", sql, /grant\s+execute\s+on\s+function\s+public\.load_identity_state\s*\(\s*\)\s+to\s+authenticated/i);
  assertNotContains("load_identity_state", block, /\b(insert|update|delete|merge|truncate)\b/i);
  assertNotContains("load_identity_state", block, /\bupdated_at\s*=\s*now\s*\(/i);
  assertNotContains("load_identity_state", block, /'owner_user_id'|'deleted_at'/i);
  assertNotContains("load_identity_state", block, /\b(access_token|refresh_token|id_token|provider_token|auth_code|otp_token_hash|service_role|service-role|serviceRoleKey)\b/i);
}

function assertPasswordStatusMigration(sql, normalized) {
  const table = extractCreateTable(sql, "identity_password_status");
  assertContains("identity_password_status", table, /\buser_id\s+uuid\s+primary\s+key\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  assertContains("identity_password_status", table, /\bpassword_setup_completed\s+boolean\s+not\s+null\s+default\s+false/i);
  assertContains("identity_password_status", table, /\bcompleted_source\s+text\s+null/i);
  assertContains("identity_password_status", table, /\bcompleted_at\s+timestamptz\s+null/i);
  assertContains("identity_password_status", table, /\bcreated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i);
  assertContains("identity_password_status", table, /\bupdated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i);
  assertContains("identity_password_status", table, /password_sign_up/i);
  assertContains("identity_password_status", table, /signup_confirmation/i);
  assertContains("identity_password_status", table, /password_sign_in/i);
  assertContains("identity_password_status", table, /password_recovery_update/i);
  assert(normalized.includes("alter table public.identity_password_status enable row level security"),
    "public.identity_password_status must enable row level security");
  assert(normalized.includes("alter table public.identity_password_status force row level security"),
    "public.identity_password_status must force row level security");
  assertContains("identity_password_status grant", sql,
    /revoke\s+all\s+on\s+table\s+public\.identity_password_status\s+from\s+anon\s*,\s*authenticated\s*,\s*public/i);
  assertNotContains("identity_password_status grant", sql,
    /grant\s+[^;]*\b(?:insert|update|delete)\b[^;]*public\.identity_password_status[^;]*to\s+authenticated/i);
  const markBlock = extractFunction(sql, "mark_password_setup_completed");
  assertContains("mark_password_setup_completed", markBlock, /returns\s+jsonb/i);
  assertContains("mark_password_setup_completed", markBlock, /security\s+definer/i);
  assertContains("mark_password_setup_completed", markBlock, /set\s+search_path\s*=\s*public/i);
  assertContains("mark_password_setup_completed", markBlock, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("mark_password_setup_completed", markBlock, /if\s+v_uid\s+is\s+null[\s\S]*?raise\s+exception/i);
  assertContains("mark_password_setup_completed", markBlock, /insert\s+into\s+public\.identity_password_status/i);
  assertContains("mark_password_setup_completed", markBlock, /on\s+conflict\s*\(\s*user_id\s*\)\s+do\s+update/i);
  assertContains("mark_password_setup_completed", markBlock, /'credential_state'\s*,\s*'complete'/i);
  assertContains("mark_password_setup_completed", sql,
    /revoke\s+all\s+on\s+function\s+public\.mark_password_setup_completed\s*\(\s*text\s*\)\s+from\s+anon\s*,\s*public/i);
  assertContains("mark_password_setup_completed", sql,
    /grant\s+execute\s+on\s+function\s+public\.mark_password_setup_completed\s*\(\s*text\s*\)\s+to\s+authenticated/i);
  assertNotContains("mark_password_setup_completed", markBlock, /\b(access_token|refresh_token|id_token|provider_token|auth_code|otp_token_hash|service_role|service-role|serviceRoleKey)\b/i);
  assertLoadIdentityState(sql);
}

function assertOAuthStatusMigration(sql, normalized) {
  const table = extractCreateTable(sql, "identity_oauth_status");
  assertContains("identity_oauth_status", table, /\buser_id\s+uuid\s+not\s+null\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  assertContains("identity_oauth_status", table, /\bprovider\s+text\s+not\s+null\s+check\s*\(\s*provider\s+in\s*\(\s*'google'\s*\)\s*\)/i);
  assertContains("identity_oauth_status", table, /\bcredential_completed\s+boolean\s+not\s+null\s+default\s+true/i);
  assertContains("identity_oauth_status", table, /\bprimary\s+key\s*\(\s*user_id\s*,\s*provider\s*\)/i);
  assert(normalized.includes("alter table public.identity_oauth_status enable row level security"),
    "public.identity_oauth_status must enable row level security");
  assert(normalized.includes("alter table public.identity_oauth_status force row level security"),
    "public.identity_oauth_status must force row level security");
  assertContains("identity_oauth_status grant", sql,
    /revoke\s+all\s+on\s+table\s+public\.identity_oauth_status\s+from\s+anon\s*,\s*authenticated\s*,\s*public/i);
  assertNotContains("identity_oauth_status grant", sql,
    /grant\s+[^;]*\b(?:insert|update|delete)\b[^;]*public\.identity_oauth_status[^;]*to\s+authenticated/i);
  const markBlock = extractFunction(sql, "mark_oauth_credential_completed");
  assertContains("mark_oauth_credential_completed", markBlock, /returns\s+jsonb/i);
  assertContains("mark_oauth_credential_completed", markBlock, /security\s+definer/i);
  assertContains("mark_oauth_credential_completed", markBlock, /set\s+search_path\s*=\s*public/i);
  assertContains("mark_oauth_credential_completed", markBlock, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("mark_oauth_credential_completed", markBlock, /v_provider\s*<>\s*'google'/i);
  assertContains("mark_oauth_credential_completed", markBlock, /insert\s+into\s+public\.identity_oauth_status/i);
  assertContains("mark_oauth_credential_completed", markBlock, /on\s+conflict\s*\(\s*user_id\s*,\s*provider\s*\)\s+do\s+update/i);
  assertContains("mark_oauth_credential_completed", markBlock, /'credential_state'\s*,\s*'complete'/i);
  assertContains("mark_oauth_credential_completed", markBlock, /'credential_provider'\s*,\s*v_provider/i);
  assertContains("mark_oauth_credential_completed", sql,
    /revoke\s+all\s+on\s+function\s+public\.mark_oauth_credential_completed\s*\(\s*text\s*\)\s+from\s+anon\s*,\s*public/i);
  assertContains("mark_oauth_credential_completed", sql,
    /grant\s+execute\s+on\s+function\s+public\.mark_oauth_credential_completed\s*\(\s*text\s*\)\s+to\s+authenticated/i);
  assertLoadIdentityState(sql);
  const loadBlock = extractFunction(sql, "load_identity_state");
  assertContains("load_identity_state oauth", loadBlock, /from\s+public\.identity_oauth_status/i);
  assertContains("load_identity_state credential provider", loadBlock, /'credential_provider'/i);
  assertContains("load_identity_state multiple", loadBlock, /'multiple'/i);
  assertNotContains("load_identity_state oauth private", loadBlock, /provider_subject|raw|email|owner_user_id/i);
}

function assertAccountSecurityMigration(sql) {
  assertContains("account security source", sql, /password_account_change/i);
  assertContains("account security source constraint", sql,
    /alter\s+table\s+public\.identity_password_status[\s\S]*?identity_password_status_completed_source_check[\s\S]*?password_account_change/i);

  const markBlock = extractFunction(sql, "mark_password_setup_completed");
  assertContains("mark_password_setup_completed 4.0B", markBlock, /password_account_change/i);
  assertContains("mark_password_setup_completed 4.0B", markBlock, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("mark_password_setup_completed 4.0B", markBlock, /security\s+definer/i);
  assertContains("mark_password_setup_completed 4.0B", sql,
    /revoke\s+all\s+on\s+function\s+public\.mark_password_setup_completed\s*\(\s*text\s*\)\s+from\s+anon\s*,\s*public/i);

  const updateProfile = extractFunction(sql, "update_identity_profile");
  assertContains("update_identity_profile", updateProfile, /returns\s+jsonb/i);
  assertContains("update_identity_profile", updateProfile, /security\s+definer/i);
  assertContains("update_identity_profile", updateProfile, /set\s+search_path\s*=\s*public/i);
  assertContains("update_identity_profile", updateProfile, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("update_identity_profile", updateProfile, /where\s+id\s*=\s*v_uid[\s\S]*?deleted_at\s+is\s+null/i);
  assertContains("update_identity_profile", updateProfile, /'display_name'[\s\S]*?'avatar_color'[\s\S]*?'onboarding_completed'/i);
  assertNotContains("update_identity_profile", updateProfile, /'owner_user_id'|'deleted_at'|\bemail\b|access_token|refresh_token|provider_token/i);
  assertContains("update_identity_profile grant", sql,
    /revoke\s+all\s+on\s+function\s+public\.update_identity_profile\s*\(\s*text\s*,\s*text\s*\)\s+from\s+anon\s*,\s*public/i);
  assertContains("update_identity_profile grant", sql,
    /grant\s+execute\s+on\s+function\s+public\.update_identity_profile\s*\(\s*text\s*,\s*text\s*\)\s+to\s+authenticated/i);

  const renameWorkspace = extractFunction(sql, "rename_identity_workspace");
  assertContains("rename_identity_workspace", renameWorkspace, /returns\s+jsonb/i);
  assertContains("rename_identity_workspace", renameWorkspace, /security\s+definer/i);
  assertContains("rename_identity_workspace", renameWorkspace, /set\s+search_path\s*=\s*public/i);
  assertContains("rename_identity_workspace", renameWorkspace, /\bv_uid\s+uuid\s*:=\s*auth\.uid\s*\(\s*\)/i);
  assertContains("rename_identity_workspace", renameWorkspace, /workspace_memberships/i);
  assertContains("rename_identity_workspace", renameWorkspace, /owner_user_id\s*=\s*v_uid/i);
  assertContains("rename_identity_workspace", renameWorkspace, /'workspace'[\s\S]*?'name'[\s\S]*?'role'\s*,\s*'owner'/i);
  assertNotContains("rename_identity_workspace", renameWorkspace, /'owner_user_id'|'deleted_at'|\bemail\b|access_token|refresh_token|provider_token/i);
  assertContains("rename_identity_workspace grant", sql,
    /revoke\s+all\s+on\s+function\s+public\.rename_identity_workspace\s*\(\s*text\s*\)\s+from\s+anon\s*,\s*public/i);
  assertContains("rename_identity_workspace grant", sql,
    /grant\s+execute\s+on\s+function\s+public\.rename_identity_workspace\s*\(\s*text\s*\)\s+to\s+authenticated/i);
}

function assertGrants(sql) {
  for (const table of ["profiles", "workspaces", "workspace_memberships"]) {
    assertContains(`public.${table}`, sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon\\s*,\\s*public`, "i"));
  }
  assertContains("profiles grant", sql, /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.profiles\s+to\s+authenticated/i);
  assertContains("workspaces grant", sql, /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.workspaces\s+to\s+authenticated/i);
  assertContains("workspace_memberships grant", sql, /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.workspace_memberships\s+to\s+authenticated/i);
  assertNotContains("workspace_memberships grant", sql, /grant\s+[^;]*\bupdate\b[^;]*public\.workspace_memberships/i);
  assertNotContains("migration", sql, /\bservice[_-]?role\b|\bserviceRoleKey\b/i);
}

function assertNoExtensionDbCalls() {
  const forbidden = [
    ["complete_onboarding RPC", /\bcomplete_onboarding\b/i],
    ["load_identity_state RPC", /\bload_identity_state\b/i],
    ["mark_password_setup_completed RPC", /\bmark_password_setup_completed\b/i],
    ["Supabase rpc call", /\b(?:client|providerClient|supabase|supabaseClient)\.rpc\s*\(/i],
    ["generic rpc call", /\.rpc\s*\(/i],
    ["profiles table call", /\.from\s*\(\s*["']profiles["']\s*\)/i],
    ["workspaces table call", /\.from\s*\(\s*["']workspaces["']\s*\)/i],
    ["workspace memberships table call", /\.from\s*\(\s*["']workspace_memberships["']\s*\)/i],
    ["Supabase database table call", /\b(?:client|providerClient|supabase|supabaseClient)\.from\s*\(/i],
  ];
  for (const file of runtimeFiles()) {
    const rel = toRel(file);
    const source = readAbs(file);
    if (rel === "tools/product/identity/identity-provider-supabase.entry.mjs") {
      const rpcMatches = source.match(/\.rpc\s*\(/g) || [];
      const onboardingRpcMatches = source.match(/\bcomplete_onboarding\b/g) || [];
      const loadRpcMatches = source.match(/\bload_identity_state\b/g) || [];
      const markPasswordMatches = source.match(/\bmark_password_setup_completed\b/g) || [];
      const markOAuthMatches = source.match(/\bmark_oauth_credential_completed\b/g) || [];
      const updateProfileMatches = source.match(/\bupdate_identity_profile\b/g) || [];
      const renameWorkspaceMatches = source.match(/\brename_identity_workspace\b/g) || [];
      const registerDeviceSessionMatches = source.match(/\bregister_device_session\b/g) || [];
      assert(rpcMatches.length === 7,
        `${rel}: only approved identity provider RPC helpers may call .rpc()`);
      assert(onboardingRpcMatches.length === 1 && source.includes('client.rpc("complete_onboarding"'),
        `${rel}: approved provider RPC helper must call only complete_onboarding`);
      assert(loadRpcMatches.length === 1 && source.includes('client.rpc("load_identity_state"'),
        `${rel}: approved provider restore helper must call only load_identity_state`);
      assert(markPasswordMatches.length === 1 && source.includes('client.rpc("mark_password_setup_completed"'),
        `${rel}: approved provider credential helper must call only mark_password_setup_completed`);
      assert(markOAuthMatches.length === 1 && source.includes('client.rpc("mark_oauth_credential_completed"'),
        `${rel}: approved provider OAuth credential helper must call only mark_oauth_credential_completed`);
      assert(updateProfileMatches.length === 1 && source.includes('client.rpc("update_identity_profile"'),
        `${rel}: approved provider account helper must call only update_identity_profile`);
      assert(renameWorkspaceMatches.length === 1 && source.includes('client.rpc("rename_identity_workspace"'),
        `${rel}: approved provider account helper must call only rename_identity_workspace`);
      assert(registerDeviceSessionMatches.length === 1 && source.includes('client.rpc("register_device_session"'),
        `${rel}: approved provider device-session helper must call only register_device_session`);
      for (const [label, pattern] of forbidden.filter(([label]) => !/rpc/i.test(label))) {
        assert(!pattern.test(source), `${rel} contains forbidden Phase 3.2D extension DB behavior: ${label}`);
      }
      continue;
    }
    for (const [label, pattern] of forbidden) {
      assert(!pattern.test(source), `${rel} contains forbidden Phase 3.2B extension DB behavior: ${label}`);
    }
  }
}

assert(exists(MIGRATION_REL), `migration file must exist: ${MIGRATION_REL}`);
assert(exists(LOAD_IDENTITY_MIGRATION_REL), `migration file must exist: ${LOAD_IDENTITY_MIGRATION_REL}`);
assert(exists(PASSWORD_STATUS_MIGRATION_REL), `migration file must exist: ${PASSWORD_STATUS_MIGRATION_REL}`);
assert(exists(LOAD_IDENTITY_CREDENTIAL_FIX_REL), `migration file must exist: ${LOAD_IDENTITY_CREDENTIAL_FIX_REL}`);
assert(exists(OAUTH_STATUS_MIGRATION_REL), `migration file must exist: ${OAUTH_STATUS_MIGRATION_REL}`);
assert(exists(ACCOUNT_SECURITY_MVP_REL), `migration file must exist: ${ACCOUNT_SECURITY_MVP_REL}`);

const sql = read(MIGRATION_REL);
const loadSql = read(LOAD_IDENTITY_MIGRATION_REL);
const passwordSql = read(PASSWORD_STATUS_MIGRATION_REL);
const loadCredentialFixSql = read(LOAD_IDENTITY_CREDENTIAL_FIX_REL);
const oauthSql = read(OAUTH_STATUS_MIGRATION_REL);
const accountSecuritySql = read(ACCOUNT_SECURITY_MVP_REL);
const normalized = normalizeSql(sql);
const normalizedPasswordSql = normalizeSql(passwordSql);
const normalizedOAuthSql = normalizeSql(oauthSql);

assertTableColumns(sql);
assertIndexesTriggersAndRls(sql, normalized);
assertPolicies(sql);
assertHelperFunction(sql, "is_workspace_owner");
assertHelperFunction(sql, "is_workspace_member");
assertCompleteOnboarding(sql);
assert(loadSql.includes("load_identity_state"), "original load identity migration must remain present");
assertPasswordStatusMigration(passwordSql, normalizedPasswordSql);
assertLoadIdentityState(loadCredentialFixSql);
assertOAuthStatusMigration(oauthSql, normalizedOAuthSql);
assertAccountSecurityMigration(accountSecuritySql);
assertGrants(sql);
assertNoExtensionDbCalls();

console.log("Identity Phase 3.2B schema validation passed.");
