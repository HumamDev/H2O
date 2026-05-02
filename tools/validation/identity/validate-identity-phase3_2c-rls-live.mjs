// Identity Phase 3.2C live validation — dev/disposable Supabase RLS harness.
// This script is opt-in. It does not run network tests unless
// H2O_SUPABASE_RLS_LIVE=1 is present. It never prints secrets, tokens,
// sessions, or raw provider responses.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LIVE_FLAG = "H2O_SUPABASE_RLS_LIVE";
const REQUIRED_FLAG = "H2O_SUPABASE_RLS_LIVE_REQUIRED";
const ENV_URL = "H2O_SUPABASE_TEST_URL";
const ENV_ANON_KEY = "H2O_SUPABASE_TEST_ANON_KEY";
const ENV_ADMIN_KEY = "H2O_SUPABASE_TEST_SERVICE_ROLE_KEY";
const ENV_USER_A_EMAIL = "H2O_SUPABASE_TEST_USER_A_EMAIL";
const ENV_USER_A_PASSWORD = "H2O_SUPABASE_TEST_USER_A_PASSWORD";
const ENV_USER_B_EMAIL = "H2O_SUPABASE_TEST_USER_B_EMAIL";
const ENV_USER_B_PASSWORD = "H2O_SUPABASE_TEST_USER_B_PASSWORD";
const ENV_PRIVILEGE_FALLBACK_CONFIRMED = "H2O_SUPABASE_RLS_PRIVILEGE_FALLBACK_CONFIRMED";
const ENV_PRIVILEGE_FALLBACK_ANON = "H2O_SUPABASE_RLS_ANON_CAN_EXECUTE";
const ENV_PRIVILEGE_FALLBACK_AUTHENTICATED = "H2O_SUPABASE_RLS_AUTHENTICATED_CAN_EXECUTE";
const SCHEMA_CACHE_RETRY_ATTEMPTS = 4;
const SCHEMA_CACHE_RETRY_DELAY_MS = 750;
const COMPLETE_ONBOARDING_PRIVILEGE_SQL = [
  "select has_function_privilege('anon', 'public.complete_onboarding(text,text,text)', 'execute') as anon_can_execute,",
  "       has_function_privilege('authenticated', 'public.complete_onboarding(text,text,text)', 'execute') as authenticated_can_execute;",
].join("\n");
const LOAD_IDENTITY_STATE_PRIVILEGE_SQL = [
  "select",
  "  has_function_privilege('anon', 'public.load_identity_state()', 'execute') as anon_can_execute,",
  "  has_function_privilege('authenticated', 'public.load_identity_state()', 'execute') as authenticated_can_execute;",
].join("\n");
const MARK_PASSWORD_SETUP_PRIVILEGE_SQL = [
  "select",
  "  has_function_privilege('anon', 'public.mark_password_setup_completed(text)', 'execute') as anon_can_execute,",
  "  has_function_privilege('authenticated', 'public.mark_password_setup_completed(text)', 'execute') as authenticated_can_execute;",
].join("\n");
const UPDATE_IDENTITY_PROFILE_PRIVILEGE_SQL = [
  "select",
  "  has_function_privilege('anon', 'public.update_identity_profile(text,text)', 'execute') as anon_can_execute,",
  "  has_function_privilege('authenticated', 'public.update_identity_profile(text,text)', 'execute') as authenticated_can_execute;",
].join("\n");
const RENAME_IDENTITY_WORKSPACE_PRIVILEGE_SQL = [
  "select",
  "  has_function_privilege('anon', 'public.rename_identity_workspace(text)', 'execute') as anon_can_execute,",
  "  has_function_privilege('authenticated', 'public.rename_identity_workspace(text)', 'execute') as authenticated_can_execute;",
].join("\n");
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs", ".json"]);
const PROVIDER_SOURCE_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const PROVIDER_BUNDLE_REL = "provider/identity-provider-supabase.js";
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
const BUILD_OUTPUT_DIRS = [
  "build/chrome-ext-dev-controls",
  "build/chrome-ext-dev-lean",
  "build/chrome-ext-prod",
  "build/chrome-ext-dev-controls-armed",
];

function abs(rel) {
  return path.join(REPO_ROOT, rel);
}

function toRel(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function env(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
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

function textFiles(root) {
  return listFiles(root).filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

function extensionSourceFiles() {
  const files = new Set();
  for (const rel of EXTENSION_RUNTIME_RELS) {
    if (exists(rel)) files.add(abs(rel));
  }
  for (const rel of EXTENSION_RUNTIME_DIRS) {
    for (const file of textFiles(abs(rel))) files.add(file);
  }
  return [...files].sort();
}

function buildOutputFiles() {
  const files = new Set();
  for (const rel of BUILD_OUTPUT_DIRS) {
    if (exists(rel)) {
      for (const file of textFiles(abs(rel))) files.add(file);
    }
  }
  return [...files].sort();
}

function assertNoExtensionSecretOrDbLeak() {
  const sourceChecks = [
    ["service-role label", /\bservice[_-]?role\b|\bserviceRoleKey\b/i],
    ["profile/workspace RPC", /\bcomplete_onboarding\b/i],
    ["identity restore RPC", /\bload_identity_state\b/i],
    ["password setup status RPC", /\bmark_password_setup_completed\b/i],
    ["generic RPC call", /\.rpc\s*\(/i],
    ["profiles table call", /\.from\s*\(\s*["']profiles["']\s*\)/i],
    ["workspaces table call", /\.from\s*\(\s*["']workspaces["']\s*\)/i],
    ["workspace_memberships table call", /\.from\s*\(\s*["']workspace_memberships["']\s*\)/i],
    ["Supabase database table call", /\b(?:client|providerClient|supabase|supabaseClient)\.from\s*\(/i],
  ];
  const buildChecks = [
    ["service-role label", /\bservice[_-]?role\b|\bserviceRoleKey\b/i],
    ["profile/workspace RPC", /\bcomplete_onboarding\b/i],
    ["identity restore RPC", /\bload_identity_state\b/i],
    ["password setup status RPC", /\bmark_password_setup_completed\b/i],
    ["profiles table call", /\.from\s*\(\s*["']profiles["']\s*\)/i],
    ["workspaces table call", /\.from\s*\(\s*["']workspaces["']\s*\)/i],
    ["workspace_memberships table call", /\.from\s*\(\s*["']workspace_memberships["']\s*\)/i],
  ];
  for (const file of extensionSourceFiles()) {
    const rel = toRel(file);
    const source = fs.readFileSync(file, "utf8");
    if (rel === PROVIDER_SOURCE_REL) {
      const rpcMatches = source.match(/\.rpc\s*\(/g) || [];
      const onboardingRpcMatches = source.match(/\bcomplete_onboarding\b/g) || [];
      const loadRpcMatches = source.match(/\bload_identity_state\b/g) || [];
      const markPasswordMatches = source.match(/\bmark_password_setup_completed\b/g) || [];
      const markOAuthMatches = source.match(/\bmark_oauth_credential_completed\b/g) || [];
      const updateProfileMatches = source.match(/\bupdate_identity_profile\b/g) || [];
      const renameWorkspaceMatches = source.match(/\brename_identity_workspace\b/g) || [];
      assert(rpcMatches.length === 6,
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
      for (const [label, pattern] of sourceChecks.filter(([label]) => !/RPC/i.test(label))) {
        assert(!pattern.test(source), `${rel} contains forbidden Phase 3.2D extension leak: ${label}`);
      }
      continue;
    }
    for (const [label, pattern] of sourceChecks) {
      assert(!pattern.test(source), `${rel} contains forbidden Phase 3.2C extension leak: ${label}`);
    }
  }
  for (const file of buildOutputFiles()) {
    const rel = toRel(file);
    const source = fs.readFileSync(file, "utf8");
    if (rel.endsWith(PROVIDER_BUNDLE_REL)) {
      assert(source.includes("complete_onboarding"),
        `${rel}: provider bundle must contain the approved complete_onboarding RPC helper`);
      assert(source.includes("load_identity_state"),
        `${rel}: provider bundle must contain the approved load_identity_state RPC helper`);
      assert(source.includes("mark_password_setup_completed"),
        `${rel}: provider bundle must contain the approved mark_password_setup_completed RPC helper`);
      assert(source.includes("update_identity_profile"),
        `${rel}: provider bundle must contain the approved update_identity_profile RPC helper`);
      assert(source.includes("rename_identity_workspace"),
        `${rel}: provider bundle must contain the approved rename_identity_workspace RPC helper`);
      for (const [label, pattern] of buildChecks.filter(([label]) => !/RPC/i.test(label))) {
        assert(!pattern.test(source), `${rel} contains forbidden Phase 3.2D build leak: ${label}`);
      }
      continue;
    }
    for (const [label, pattern] of buildChecks) {
      assert(!pattern.test(source), `${rel} contains forbidden Phase 3.2C build leak: ${label}`);
    }
  }
}

function safeClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function randomToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function generatedEmail(label) {
  return `h2o-rls-${label}-${randomToken()}@example.com`;
}

function generatedPassword() {
  return `H2O-rls-${randomToken()}-${randomToken()}!`;
}

async function call(label, fn) {
  try {
    const result = await fn();
    console.log(`  PASS: ${label}`);
    return result;
  } catch (error) {
    const message = error && typeof error.message === "string" ? error.message : "unknown failure";
    throw new Error(`${label}: ${message}`);
  }
}

function failSafe(label, code = "unexpected") {
  throw new Error(`${label}: ${code}`);
}

function assertNoError(label, result) {
  if (result?.error) failSafe(label, result.error.code || result.error.status || "provider-error");
  return result;
}

function assertRejected(label, result) {
  if (!result?.error) failSafe(label, "operation unexpectedly succeeded");
  return result;
}

function safeCredentialState(data) {
  const src = data && typeof data === "object" ? data : {};
  const value = String(src.credential_state || src.credentialState || "").trim().toLowerCase();
  if (value === "complete" || value === "required" || value === "unknown") return value;
  return "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPostgrestTransientNotReady(error) {
  if (!error) return false;
  const code = String(error.code || error.status || error.statusCode || "").toUpperCase();
  const message = [
    error.message,
    error.details,
    error.hint,
  ].map((part) => String(part || "").toLowerCase()).join(" ");
  return code === "PGRST001"
    || code === "PGRST002"
    || message.includes("schema cache")
    || message.includes("database client error")
    || message.includes("retrying the connection");
}

function isExpectedDenial(error) {
  if (!error) return false;
  const code = String(error.code || error.status || error.statusCode || "").toLowerCase();
  const message = [
    error.name,
    error.message,
    error.details,
    error.hint,
    error.code,
    error.status,
    error.statusCode,
  ].map((part) => String(part || "").toLowerCase()).join(" ");
  return code === "42501"
    || code === "401"
    || code === "403"
    || message.includes("permission denied")
    || message.includes("insufficient privilege")
    || message.includes("row-level security")
    || message.includes("row level security")
    || message.includes("rls")
    || message.includes("unauthorized")
    || message.includes("forbidden")
    || message.includes("unauthenticated")
    || message.includes("not authenticated")
    || message.includes("authentication required")
    || message.includes("invalid jwt")
    || message.includes("jwt missing")
    || message.includes("missing jwt")
    || message.includes("jwt expired")
    || message.includes("jwt")
    || message.includes("permission denied for function")
    || message.includes("execute denied")
    || message.includes("execution denied")
    || message.includes("function execution denied")
    || (message.includes("execute") && message.includes("denied"))
    || (message.includes("function") && message.includes("denied"))
    || (message.includes("anon") && message.includes("denied"))
    || (message.includes("role anon") && message.includes("permission"));
}

function sanitizeErrorText(value) {
  return String(value || "")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[jwt]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function safeErrorSummary(error) {
  const code = sanitizeErrorText(error?.code || error?.status || error?.statusCode || "no-code");
  const message = sanitizeErrorText(error?.message || error?.details || error?.hint || "no-message");
  return `code=${code}; message=${message}`;
}

function assertExpectedDenial(label, result) {
  if (!result?.error) failSafe(label, "operation unexpectedly succeeded");
  assert(isExpectedDenial(result.error), `${label}: unexpected denial (${safeErrorSummary(result.error)})`);
  return result;
}

function assertExpectedDenialOrNoRows(label, result) {
  if (result?.error) {
    assert(isExpectedDenial(result.error), `${label}: unexpected denial (${safeErrorSummary(result.error)})`);
    return result;
  }
  const rows = Array.isArray(result?.data) ? result.data : [];
  assert(rows.length === 0, `${label}: operation unexpectedly returned or affected rows`);
  return result;
}

function verifyCompleteOnboardingPrivilegesFallback() {
  console.log(`  INFO: DB privilege fallback SQL: ${COMPLETE_ONBOARDING_PRIVILEGE_SQL}`);
  const confirmed = env(ENV_PRIVILEGE_FALLBACK_CONFIRMED) === "1";
  const anonCanExecute = env(ENV_PRIVILEGE_FALLBACK_ANON).toLowerCase() === "true";
  const authenticatedCanExecute = env(ENV_PRIVILEGE_FALLBACK_AUTHENTICATED).toLowerCase() === "true";
  const fallbackMatches = confirmed && anonCanExecute === false && authenticatedCanExecute === true;
  if (fallbackMatches) return;
  const guidance = [
    "PostgREST schema/cache connection not ready. Run the SQL privilege query in Supabase SQL Editor.",
    `If anon_can_execute=false and authenticated_can_execute=true, rerun with ${ENV_PRIVILEGE_FALLBACK_CONFIRMED}=1 ${ENV_PRIVILEGE_FALLBACK_ANON}=false ${ENV_PRIVILEGE_FALLBACK_AUTHENTICATED}=true.`,
  ].join(" ");
  if (!confirmed) throw new Error(guidance);
  if (anonCanExecute !== false || authenticatedCanExecute !== true) {
    throw new Error(`Manual SQL privilege fallback did not confirm complete_onboarding grants: anon_can_execute=${anonCanExecute}; authenticated_can_execute=${authenticatedCanExecute}`);
  }
}

function verifyLoadIdentityStatePrivilegesFallback() {
  console.log(`  INFO: DB privilege fallback SQL: ${LOAD_IDENTITY_STATE_PRIVILEGE_SQL}`);
  const confirmed = env(ENV_PRIVILEGE_FALLBACK_CONFIRMED) === "1";
  const anonCanExecute = env(ENV_PRIVILEGE_FALLBACK_ANON).toLowerCase() === "true";
  const authenticatedCanExecute = env(ENV_PRIVILEGE_FALLBACK_AUTHENTICATED).toLowerCase() === "true";
  const fallbackMatches = confirmed && anonCanExecute === false && authenticatedCanExecute === true;
  if (fallbackMatches) return;
  const guidance = [
    "PostgREST schema/cache connection not ready. Run the SQL privilege query in Supabase SQL Editor.",
    `If anon_can_execute=false and authenticated_can_execute=true for public.load_identity_state(), rerun with ${ENV_PRIVILEGE_FALLBACK_CONFIRMED}=1 ${ENV_PRIVILEGE_FALLBACK_ANON}=false ${ENV_PRIVILEGE_FALLBACK_AUTHENTICATED}=true.`,
  ].join(" ");
  if (!confirmed) throw new Error(guidance);
  if (anonCanExecute !== false || authenticatedCanExecute !== true) {
    throw new Error(`Manual SQL privilege fallback did not confirm load_identity_state grants: anon_can_execute=${anonCanExecute}; authenticated_can_execute=${authenticatedCanExecute}`);
  }
}

function verifyMarkPasswordSetupPrivilegesFallback() {
  console.log(`  INFO: DB privilege fallback SQL: ${MARK_PASSWORD_SETUP_PRIVILEGE_SQL}`);
  const confirmed = env(ENV_PRIVILEGE_FALLBACK_CONFIRMED) === "1";
  const anonCanExecute = env(ENV_PRIVILEGE_FALLBACK_ANON).toLowerCase() === "true";
  const authenticatedCanExecute = env(ENV_PRIVILEGE_FALLBACK_AUTHENTICATED).toLowerCase() === "true";
  const fallbackMatches = confirmed && anonCanExecute === false && authenticatedCanExecute === true;
  if (fallbackMatches) return;
  const guidance = [
    "PostgREST schema/cache connection not ready. Run the SQL privilege query in Supabase SQL Editor.",
    `If anon_can_execute=false and authenticated_can_execute=true for public.mark_password_setup_completed(text), rerun with ${ENV_PRIVILEGE_FALLBACK_CONFIRMED}=1 ${ENV_PRIVILEGE_FALLBACK_ANON}=false ${ENV_PRIVILEGE_FALLBACK_AUTHENTICATED}=true.`,
  ].join(" ");
  if (!confirmed) throw new Error(guidance);
  if (anonCanExecute !== false || authenticatedCanExecute !== true) {
    throw new Error(`Manual SQL privilege fallback did not confirm mark_password_setup_completed grants: anon_can_execute=${anonCanExecute}; authenticated_can_execute=${authenticatedCanExecute}`);
  }
}

async function assertAnonCompleteOnboardingDenied(anon) {
  for (let attempt = 1; attempt <= SCHEMA_CACHE_RETRY_ATTEMPTS; attempt += 1) {
    const result = await anon.rpc("complete_onboarding", {
      p_display_name: "Anon",
      p_avatar_color: "gray",
      p_workspace_name: "Anon Workspace",
    });
    if (!result?.error) failSafe("Anon complete_onboarding", "operation unexpectedly succeeded");
    if (!isPostgrestTransientNotReady(result.error)) {
      assertExpectedDenial("Anon complete_onboarding", result);
      console.log("  PASS: Anon cannot execute complete_onboarding");
      return;
    }
    if (attempt < SCHEMA_CACHE_RETRY_ATTEMPTS) {
      await delay(SCHEMA_CACHE_RETRY_DELAY_MS);
      continue;
    }
    verifyCompleteOnboardingPrivilegesFallback();
    console.log("  PASS: Anon cannot execute complete_onboarding (verified by manual SQL privilege fallback after PostgREST cache error)");
    return;
  }
}

async function assertAnonLoadIdentityStateDenied(anon) {
  for (let attempt = 1; attempt <= SCHEMA_CACHE_RETRY_ATTEMPTS; attempt += 1) {
    const result = await anon.rpc("load_identity_state");
    if (!result?.error) failSafe("Anon load_identity_state", "operation unexpectedly succeeded");
    if (!isPostgrestTransientNotReady(result.error)) {
      assertExpectedDenial("Anon load_identity_state", result);
      console.log("  PASS: Anon cannot execute load_identity_state");
      return;
    }
    if (attempt < SCHEMA_CACHE_RETRY_ATTEMPTS) {
      await delay(SCHEMA_CACHE_RETRY_DELAY_MS);
      continue;
    }
    verifyLoadIdentityStatePrivilegesFallback();
    console.log("  PASS: Anon cannot execute load_identity_state (verified by manual SQL privilege fallback after PostgREST cache error)");
    return;
  }
}

async function assertAnonMarkPasswordSetupDenied(anon) {
  for (let attempt = 1; attempt <= SCHEMA_CACHE_RETRY_ATTEMPTS; attempt += 1) {
    const result = await anon.rpc("mark_password_setup_completed", { p_source: "password_sign_in" });
    if (!result?.error) failSafe("Anon mark_password_setup_completed", "operation unexpectedly succeeded");
    if (!isPostgrestTransientNotReady(result.error)) {
      assertExpectedDenial("Anon mark_password_setup_completed", result);
      console.log("  PASS: Anon cannot execute mark_password_setup_completed");
      return;
    }
    if (attempt < SCHEMA_CACHE_RETRY_ATTEMPTS) {
      await delay(SCHEMA_CACHE_RETRY_DELAY_MS);
      continue;
    }
    verifyMarkPasswordSetupPrivilegesFallback();
    console.log("  PASS: Anon cannot execute mark_password_setup_completed (verified by manual SQL privilege fallback after PostgREST cache error)");
    return;
  }
}

async function assertAnonUpdateIdentityProfileDenied(anon) {
  for (let attempt = 1; attempt <= SCHEMA_CACHE_RETRY_ATTEMPTS; attempt += 1) {
    const result = await anon.rpc("update_identity_profile", {
      p_display_name: "Anon",
      p_avatar_color: "gray",
    });
    if (!result?.error) failSafe("Anon update_identity_profile", "operation unexpectedly succeeded");
    if (!isPostgrestTransientNotReady(result.error)) {
      assertExpectedDenial("Anon update_identity_profile", result);
      console.log("  PASS: Anon cannot execute update_identity_profile");
      return;
    }
    if (attempt < SCHEMA_CACHE_RETRY_ATTEMPTS) {
      await delay(SCHEMA_CACHE_RETRY_DELAY_MS);
      continue;
    }
    console.log(`  INFO: DB privilege fallback SQL: ${UPDATE_IDENTITY_PROFILE_PRIVILEGE_SQL}`);
    verifyMarkPasswordSetupPrivilegesFallback();
    console.log("  PASS: Anon cannot execute update_identity_profile (verified by manual SQL privilege fallback after PostgREST cache error)");
    return;
  }
}

async function assertAnonRenameIdentityWorkspaceDenied(anon) {
  for (let attempt = 1; attempt <= SCHEMA_CACHE_RETRY_ATTEMPTS; attempt += 1) {
    const result = await anon.rpc("rename_identity_workspace", {
      p_workspace_name: "Anon Workspace",
    });
    if (!result?.error) failSafe("Anon rename_identity_workspace", "operation unexpectedly succeeded");
    if (!isPostgrestTransientNotReady(result.error)) {
      assertExpectedDenial("Anon rename_identity_workspace", result);
      console.log("  PASS: Anon cannot execute rename_identity_workspace");
      return;
    }
    if (attempt < SCHEMA_CACHE_RETRY_ATTEMPTS) {
      await delay(SCHEMA_CACHE_RETRY_DELAY_MS);
      continue;
    }
    console.log(`  INFO: DB privilege fallback SQL: ${RENAME_IDENTITY_WORKSPACE_PRIVILEGE_SQL}`);
    verifyMarkPasswordSetupPrivilegesFallback();
    console.log("  PASS: Anon cannot execute rename_identity_workspace (verified by manual SQL privilege fallback after PostgREST cache error)");
    return;
  }
}

function assertRejectedOrNoRows(label, result) {
  if (result?.error) return result;
  const rows = Array.isArray(result?.data) ? result.data : [];
  assert(rows.length === 0, `${label}: operation unexpectedly affected rows`);
  return result;
}

function assertRows(label, result, expectedCount) {
  assertNoError(label, result);
  const rows = Array.isArray(result.data) ? result.data : [];
  assert(rows.length === expectedCount, `${label}: expected ${expectedCount} row(s), got ${rows.length}`);
  return rows;
}

async function ensureUser(admin, email, password, createdUsers) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assertNoError(`create test user ${email.includes("h2o-rls-") ? "generated" : "provided"}`, created);
  const user = created.data?.user;
  assert(user?.id, "created test user missing id");
  createdUsers.push(user.id);
  return user;
}

async function signIn(url, anonKey, email, password) {
  const client = safeClient(url, anonKey);
  const result = await client.auth.signInWithPassword({ email, password });
  assertNoError("sign in test user", result);
  assert(result.data?.session?.access_token, "test user session missing");
  return client;
}

function assertSafeLoadedIdentity(label, data, expectedUserId, expectedWorkspaceId = null) {
  const src = data && typeof data === "object" ? data : {};
  assert(src.profile && typeof src.profile === "object", `${label}: profile missing`);
  assert(src.workspace && typeof src.workspace === "object", `${label}: workspace missing`);
  assert(src.profile.id === expectedUserId, `${label}: profile id mismatch`);
  if (expectedWorkspaceId) assert(src.workspace.id === expectedWorkspaceId, `${label}: workspace id mismatch`);
  assert(src.role === "owner", `${label}: owner role missing`);
  const credentialState = safeCredentialState(src);
  assert(credentialState === "complete", `${label}: credential_state should be complete; got ${credentialState || "missing"}`);
  const serialized = JSON.stringify(src).toLowerCase();
  assert(!serialized.includes("owner_user_id"), `${label}: owner_user_id leaked`);
  assert(!serialized.includes("deleted_at"), `${label}: deleted_at leaked`);
  assert(!serialized.includes("access_token") && !serialized.includes("refresh_token"),
    `${label}: token field leaked`);
  return src;
}

function assertMissingLoadedIdentity(label, data) {
  const src = data && typeof data === "object" ? data : {};
  assert(src.profile === null, `${label}: profile should be null`);
  assert(src.workspace === null, `${label}: workspace should be null`);
  assert(src.role === null, `${label}: role should be null`);
  const credentialState = safeCredentialState(src);
  assert(credentialState === "required", `${label}: missing password status should require setup; got ${credentialState || "missing"}`);
}

async function runLive() {
  const url = env(ENV_URL);
  const anonKey = env(ENV_ANON_KEY);
  const adminKey = env(ENV_ADMIN_KEY);
  const missing = [
    [ENV_URL, url],
    [ENV_ANON_KEY, anonKey],
    [ENV_ADMIN_KEY, adminKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  assert(missing.length === 0, `missing required live env vars: ${missing.join(", ")}`);

  const userAEmail = env(ENV_USER_A_EMAIL) || generatedEmail("a");
  const userAPassword = env(ENV_USER_A_PASSWORD) || generatedPassword();
  const userBEmail = env(ENV_USER_B_EMAIL) || generatedEmail("b");
  const userBPassword = env(ENV_USER_B_PASSWORD) || generatedPassword();
  const hasUserAEmail = Boolean(env(ENV_USER_A_EMAIL));
  const hasUserAPassword = Boolean(env(ENV_USER_A_PASSWORD));
  const hasUserBEmail = Boolean(env(ENV_USER_B_EMAIL));
  const hasUserBPassword = Boolean(env(ENV_USER_B_PASSWORD));
  assert(hasUserAEmail === hasUserAPassword, `provide both ${ENV_USER_A_EMAIL} and ${ENV_USER_A_PASSWORD}, or neither`);
  assert(hasUserBEmail === hasUserBPassword, `provide both ${ENV_USER_B_EMAIL} and ${ENV_USER_B_PASSWORD}, or neither`);
  const providedUserA = hasUserAEmail && hasUserAPassword;
  const providedUserB = hasUserBEmail && hasUserBPassword;
  const admin = safeClient(url, adminKey);
  const anon = safeClient(url, anonKey);
  const createdUsers = [];

  try {
    const userA = providedUserA
      ? null
      : await ensureUser(admin, userAEmail, userAPassword, createdUsers);
    if (providedUserA) assert(userAEmail && userAPassword, "provided user A requires email and password");
    const userB = providedUserB
      ? null
      : await ensureUser(admin, userBEmail, userBPassword, createdUsers);
    if (providedUserB) assert(userBEmail && userBPassword, "provided user B requires email and password");
    const userCEmail = generatedEmail("c");
    const userCPassword = generatedPassword();
    const userC = await ensureUser(admin, userCEmail, userCPassword, createdUsers);

    const userAClient = await signIn(url, anonKey, userAEmail, userAPassword);
    const userBClient = await signIn(url, anonKey, userBEmail, userBPassword);
    const userCClient = await signIn(url, anonKey, userCEmail, userCPassword);

    const userAId = providedUserA
      ? (await userAClient.auth.getUser()).data?.user?.id
      : userA.id;
    const userBId = providedUserB
      ? (await userBClient.auth.getUser()).data?.user?.id
      : userB.id;
    assert(userAId && userBId && userAId !== userBId, "test users must have distinct ids");
    assert(userC?.id && userC.id !== userAId && userC.id !== userBId, "missing-row fixture user must be distinct");

    await call("Missing profile/workspace user loads null identity state", async () => {
      const result = await userCClient.rpc("load_identity_state");
      assertNoError("User C load_identity_state missing rows", result);
      assertMissingLoadedIdentity("User C load_identity_state missing rows", result.data);
    });

    await call("User A can mark password setup complete through RPC", async () => {
      const result = await userAClient.rpc("mark_password_setup_completed", { p_source: "password_sign_in" });
      assertNoError("User A mark_password_setup_completed", result);
      assert(result.data?.credential_state === "complete", "User A credential state should be complete");
    });

    await call("User A cannot write password status table directly", async () => {
      assertRejected("User A direct password status insert", await userAClient.from("identity_password_status").insert({
        user_id: userAId,
        password_setup_completed: true,
        completed_source: "password_sign_in",
      }));
    });

    const aOnboard = await call("User A can complete onboarding", async () => {
      const result = await userAClient.rpc("complete_onboarding", {
        p_display_name: "User A",
        p_avatar_color: "blue",
        p_workspace_name: "User A Workspace",
      });
      assertNoError("User A complete_onboarding", result);
      assert(result.data?.profile?.id === userAId, "User A profile id mismatch");
      assert(result.data?.workspace?.owner_user_id === userAId, "User A workspace owner mismatch");
      assert(result.data?.role === "owner", "User A role mismatch");
      return result.data;
    });

    await call("User A complete_onboarding is idempotent", async () => {
      const result = await userAClient.rpc("complete_onboarding", {
        p_display_name: "User A Again",
        p_avatar_color: "green",
        p_workspace_name: "User A Workspace Again",
      });
      assertNoError("User A complete_onboarding idempotent", result);
      assert(result.data?.workspace?.id === aOnboard.workspace.id, "User A second onboarding created a second active workspace");
    });

    const aLoaded = await call("User A can load own identity state", async () => {
      const result = await userAClient.rpc("load_identity_state");
      assertNoError("User A load_identity_state", result);
      return assertSafeLoadedIdentity("User A load_identity_state", result.data, userAId, aOnboard.workspace.id);
    });

    await call("User A can update own profile through account RPC", async () => {
      const result = await userAClient.rpc("update_identity_profile", {
        p_display_name: "User A Edited",
        p_avatar_color: "teal",
      });
      assertNoError("User A update_identity_profile", result);
      assert(result.data?.profile?.id === userAId, "User A edited profile id mismatch");
      assert(result.data?.profile?.display_name === "User A Edited", "User A edited profile name mismatch");
      const serialized = JSON.stringify(result.data).toLowerCase();
      assert(!serialized.includes("deleted_at") && !serialized.includes("owner_user_id"), "unsafe profile update field leaked");
    });

    await call("User A can rename own workspace through account RPC", async () => {
      const result = await userAClient.rpc("rename_identity_workspace", {
        p_workspace_name: "User A Renamed Workspace",
      });
      assertNoError("User A rename_identity_workspace", result);
      assert(result.data?.workspace?.id === aOnboard.workspace.id, "User A renamed workspace id mismatch");
      assert(result.data?.workspace?.name === "User A Renamed Workspace", "User A renamed workspace name mismatch");
      assert(result.data?.role === "owner", "User A renamed workspace role mismatch");
      const serialized = JSON.stringify(result.data).toLowerCase();
      assert(!serialized.includes("owner_user_id") && !serialized.includes("deleted_at"), "unsafe workspace update field leaked");
    });

    const aLoadedAfterUpdate = await call("User A can load edited identity state", async () => {
      const result = await userAClient.rpc("load_identity_state");
      assertNoError("User A load_identity_state after account edit", result);
      return assertSafeLoadedIdentity("User A load_identity_state after account edit", result.data, userAId, aOnboard.workspace.id);
    });

    await call("Repeated identity load does not mutate updated_at", async () => {
      const result = await userAClient.rpc("load_identity_state");
      assertNoError("User A repeated load_identity_state", result);
      const second = assertSafeLoadedIdentity("User A repeated load_identity_state", result.data, userAId, aOnboard.workspace.id);
      assert(String(second.profile.updated_at) === String(aLoadedAfterUpdate.profile.updated_at),
        "profile updated_at changed during read-only load");
      assert(String(second.workspace.updated_at) === String(aLoadedAfterUpdate.workspace.updated_at),
        "workspace updated_at changed during read-only load");
    });

    const bOnboard = await call("User B can complete onboarding for isolation fixture", async () => {
      const result = await userBClient.rpc("complete_onboarding", {
        p_display_name: "User B",
        p_avatar_color: "purple",
        p_workspace_name: "User B Workspace",
      });
      assertNoError("User B complete_onboarding", result);
      return result.data;
    });

    await call("User A can select own profile", async () => {
      assertRows("User A own profile", await userAClient.from("profiles").select("id").eq("id", userAId), 1);
    });

    await call("User A cannot select User B profile", async () => {
      assertRows("User A select User B profile", await userAClient.from("profiles").select("id").eq("id", userBId), 0);
    });

    await call("User A cannot insert profile for User B", async () => {
      assertRejected("User A insert User B profile", await userAClient.from("profiles").insert({
        id: userBId,
        display_name: "Wrong User",
        avatar_color: "red",
        onboarding_completed: true,
      }));
    });

    await call("User A cannot create workspace owned by User B", async () => {
      assertRejected("User A create User B workspace", await userAClient.from("workspaces").insert({
        owner_user_id: userBId,
        name: "Wrong Workspace",
      }));
    });

    await call("User A cannot create second active workspace", async () => {
      assertRejected("User A second active workspace", await userAClient.from("workspaces").insert({
        owner_user_id: userAId,
        name: "Second Workspace",
      }));
    });

    await call("User A cannot insert membership for User B", async () => {
      assertRejected("User A insert User B membership", await userAClient.from("workspace_memberships").insert({
        workspace_id: aOnboard.workspace.id,
        user_id: userBId,
        role: "owner",
      }));
    });

    await call("User A cannot insert membership into User B workspace", async () => {
      assertRejected("User A insert membership into User B workspace", await userAClient.from("workspace_memberships").insert({
        workspace_id: bOnboard.workspace.id,
        user_id: userAId,
        role: "owner",
      }));
    });

    await call("User A cannot escalate membership role", async () => {
      assertRejected("User A admin role insert", await userAClient.from("workspace_memberships").insert({
        workspace_id: aOnboard.workspace.id,
        user_id: userAId,
        role: "admin",
      }));
    });

    await call("User A cannot update workspace owner", async () => {
      assertRejected("User A update workspace owner", await userAClient.from("workspaces")
        .update({ owner_user_id: userBId })
        .eq("id", aOnboard.workspace.id));
    });

    await call("User A cannot update membership role", async () => {
      const rows = assertRows("User A membership lookup", await userAClient.from("workspace_memberships")
        .select("id")
        .eq("workspace_id", aOnboard.workspace.id)
        .eq("user_id", userAId), 1);
      assertRejectedOrNoRows("User A update membership role", await userAClient.from("workspace_memberships")
        .update({ role: "member" })
        .select("id")
        .eq("id", rows[0].id));
    });

    await call("User A cannot delete profile", async () => {
      assertRejectedOrNoRows("User A delete profile", await userAClient.from("profiles").delete().select("id").eq("id", userAId));
    });

    await call("User A cannot delete workspace", async () => {
      assertRejectedOrNoRows("User A delete workspace", await userAClient.from("workspaces").delete().select("id").eq("id", aOnboard.workspace.id));
    });

    await call("User A cannot delete membership", async () => {
      assertRejectedOrNoRows("User A delete membership", await userAClient.from("workspace_memberships")
        .delete()
        .select("id")
        .eq("workspace_id", aOnboard.workspace.id)
        .eq("user_id", userAId));
    });

    await assertAnonCompleteOnboardingDenied(anon);

    await assertAnonLoadIdentityStateDenied(anon);

    await assertAnonMarkPasswordSetupDenied(anon);

    await assertAnonUpdateIdentityProfileDenied(anon);

    await assertAnonRenameIdentityWorkspaceDenied(anon);

    await call("Anon cannot select profiles", async () => {
      assertExpectedDenialOrNoRows("Anon select profiles", await anon.from("profiles").select("id").limit(1));
    });

    await call("Anon cannot insert profiles", async () => {
      assertExpectedDenial("Anon insert profile", await anon.from("profiles").insert({
        id: userAId,
        display_name: "Anon",
        avatar_color: "gray",
      }));
    });

    await call("Anon cannot update profiles", async () => {
      assertExpectedDenialOrNoRows("Anon update profile", await anon.from("profiles").update({ display_name: "Anon" }).select("id").eq("id", userAId));
    });

    await call("Anon cannot delete profiles", async () => {
      assertExpectedDenialOrNoRows("Anon delete profile", await anon.from("profiles").delete().select("id").eq("id", userAId));
    });

    await call("Anon cannot select workspaces", async () => {
      assertExpectedDenialOrNoRows("Anon select workspaces", await anon.from("workspaces").select("id").limit(1));
    });

    await call("Anon cannot insert workspaces", async () => {
      assertExpectedDenial("Anon insert workspace", await anon.from("workspaces").insert({
        owner_user_id: userAId,
        name: "Anon Workspace",
      }));
    });

    await call("Anon cannot update workspaces", async () => {
      assertExpectedDenialOrNoRows("Anon update workspace", await anon.from("workspaces").update({ name: "Anon Workspace" }).select("id").eq("id", aOnboard.workspace.id));
    });

    await call("Anon cannot delete workspaces", async () => {
      assertExpectedDenialOrNoRows("Anon delete workspace", await anon.from("workspaces").delete().select("id").eq("id", aOnboard.workspace.id));
    });

    await call("Anon cannot select workspace_memberships", async () => {
      assertExpectedDenialOrNoRows("Anon select memberships", await anon.from("workspace_memberships").select("id").limit(1));
    });

    await call("Anon cannot insert workspace_memberships", async () => {
      assertExpectedDenial("Anon insert membership", await anon.from("workspace_memberships").insert({
        workspace_id: aOnboard.workspace.id,
        user_id: userAId,
        role: "owner",
      }));
    });

    await call("Anon cannot update workspace_memberships", async () => {
      assertExpectedDenialOrNoRows("Anon update membership", await anon.from("workspace_memberships")
        .update({ role: "owner" })
        .select("id")
        .eq("workspace_id", aOnboard.workspace.id)
        .eq("user_id", userAId));
    });

    await call("Anon cannot delete workspace_memberships", async () => {
      assertExpectedDenialOrNoRows("Anon delete membership", await anon.from("workspace_memberships")
        .delete()
        .select("id")
        .eq("workspace_id", aOnboard.workspace.id)
        .eq("user_id", userAId));
    });

    await call("User B cannot read User A workspace or membership", async () => {
      assertRows("User B select User A workspace", await userBClient.from("workspaces").select("id").eq("id", aOnboard.workspace.id), 0);
      assertRows("User B select User A membership", await userBClient.from("workspace_memberships")
        .select("id")
        .eq("workspace_id", aOnboard.workspace.id), 0);
    });
  } finally {
    for (const userId of createdUsers.reverse()) {
      try {
        await admin.auth.admin.deleteUser(userId);
        console.log("  CLEANUP: removed generated test user");
      } catch {
        console.warn("  WARN: generated test user cleanup failed");
      }
    }
  }
}

assertNoExtensionSecretOrDbLeak();

const liveRequested = env(LIVE_FLAG) === "1";
const liveRequired = env(REQUIRED_FLAG) === "1";

if (!liveRequested) {
  const message = [
    "Identity Phase 3.2C live RLS validation skipped.",
    `Set ${LIVE_FLAG}=1 with ${ENV_URL}, ${ENV_ANON_KEY}, and ${ENV_ADMIN_KEY} to run against a dev/disposable Supabase project.`,
  ].join("\n");
  if (liveRequired) {
    console.error(`FAIL: ${LIVE_FLAG}=1 is required when ${REQUIRED_FLAG}=1`);
    process.exit(1);
  }
  console.log(message);
  process.exit(0);
}

try {
  await runLive();
  console.log("Identity Phase 3.2C live RLS validation passed.");
} catch (error) {
  const message = error && typeof error.message === "string" ? error.message : "unknown failure";
  console.error(`Identity Phase 3.2C live RLS validation failed: ${message}`);
  process.exit(1);
}
