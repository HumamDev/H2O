// Identity Phase 5.0B validation - mobile alignment core.
// Static only; no Supabase/network access, storage mutation, or app launch.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const MOBILE_ROOT_REL = "apps/studio-mobile";
const MOBILE_SRC_REL = "apps/studio-mobile/src";
const PACKAGE_REL = "apps/studio-mobile/package.json";
const APP_JSON_REL = "apps/studio-mobile/app.json";
const DOC_REL = "docs/identity/IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md";
const RECOVERY_CLOSEOUT_REL = "docs/identity/IDENTITY_PHASE_5_0D_RECOVERY_CLOSEOUT.md";
const MOBILE_CONFIG_REL = "apps/studio-mobile/src/identity/mobileConfig.ts";
const SECURE_STORE_REL = "apps/studio-mobile/src/identity/secureStore.ts";
const MOBILE_STORAGE_REL = "apps/studio-mobile/src/identity/mobileStorage.ts";
const SELF_CHECK_REL = "apps/studio-mobile/src/identity/selfCheck.ts";
const MOBILE_PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const IDENTITY_CONTEXT_REL = "apps/studio-mobile/src/identity/IdentityContext.tsx";
const SETTINGS_REL = "apps/studio-mobile/src/app/settings.tsx";
const IDENTITY_DEBUG_REL = "apps/studio-mobile/src/app/identity-debug.tsx";

const TOKEN_KEY_RE =
  /access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawEmail|providerIdentity|identity_data|currentPassword|current_password|newPassword|confirmPassword|owner_user_id|deleted_at|^password$|token|secret|credential/i;

function abs(rel) {
  return path.join(REPO_ROOT, rel);
}

function read(rel) {
  return fs.readFileSync(abs(rel), "utf8");
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function relFromAbs(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

function walkFiles(rootRel, exts = [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"]) {
  const root = abs(rootRel);
  const out = [];
  const skip = new Set(["node_modules", ".expo", ".git", "dist", "build", "coverage"]);

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (entry.isFile() && exts.includes(path.extname(entry.name))) out.push(relFromAbs(full));
    }
  }

  visit(root);
  return out.sort();
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function extractBlockByName(source, name) {
  const patterns = [
    new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`),
    new RegExp(`(?:private\\s+|public\\s+|protected\\s+)?(?:async\\s+)?${name}\\s*\\(`),
  ];
  let start = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match && (start < 0 || match.index < start)) start = match.index;
  }
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

function findSourceMatches(files, pattern) {
  const matches = [];
  for (const rel of files) {
    const source = read(rel);
    const lines = source.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (pattern.test(line)) matches.push({ rel, line: index + 1, text: line.trim() });
      pattern.lastIndex = 0;
    }
  }
  return matches;
}

function assertOnlyFileImports(files, moduleName, allowedRel, label) {
  const importRe = new RegExp(`from\\s+['"]${moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]|import\\s+[^;]*['"]${moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`);
  for (const rel of files) {
    if (!importRe.test(read(rel))) continue;
    assert(rel === allowedRel, `${label}: ${moduleName} import is only allowed in ${allowedRel}; found in ${rel}`);
  }
}

function assertNoMatches(files, pattern, label) {
  const matches = findSourceMatches(files, pattern);
  assert(matches.length === 0,
    `${label}: found ${matches.map(match => `${match.rel}:${match.line}`).join(", ")}`);
}

function assertNoUnsafeObjectKeys(label, body) {
  const keyRe = /(?:^|[,{]\s*)(['"]?)([A-Za-z_$][\w$]*|[a-z_]+)\1\s*:/gm;
  for (const match of body.matchAll(keyRe)) {
    const key = match[2];
    assert(!TOKEN_KEY_RE.test(key), `${label}: object key "${key}" must not be token/session/private shaped`);
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function assertNoServiceRole(label, source) {
  assert(!/\b(service_role|service-role|serviceRole|SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY)\b/.test(source),
    `${label}: service-role strings are forbidden`);
  for (const token of source.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const payload = JSON.parse(decodeBase64Url(token[0].split(".")[1]));
      assert(payload?.role !== "service_role", `${label}: service-role JWT is forbidden`);
    } catch {
      // Non-JWT-looking false positives are ignored.
    }
  }
}

function flattenJson(value, pathLabel = "root", out = []) {
  if (value === null || typeof value !== "object") {
    out.push({ path: pathLabel, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJson(item, `${pathLabel}[${index}]`, out));
    return out;
  }
  for (const [key, child] of Object.entries(value)) flattenJson(child, `${pathLabel}.${key}`, out);
  return out;
}

function assertNoOauthCallbackConfig(appJson) {
  const blocked = [];
  const providerRe = /\b(google|microsoft|github|apple)\b/i;
  for (const item of flattenJson(appJson)) {
    const keyPath = item.path;
    const value = typeof item.value === "string" ? item.value : "";
    const haystack = `${keyPath} ${value}`;
    if (/\boauth\b/i.test(haystack)) blocked.push(keyPath);
    if (/\bcallback\b/i.test(haystack) && /\b(auth|oauth|supabase|google|microsoft|github|apple)\b/i.test(haystack)) blocked.push(keyPath);
    if (providerRe.test(haystack) && /\b(auth|oauth|callback|redirect|scheme)\b/i.test(haystack)) blocked.push(keyPath);
    if (/\bsupabase\b/i.test(haystack) && /\b(callback|redirect|auth|oauth)\b/i.test(haystack)) blocked.push(keyPath);
  }
  assert(blocked.length === 0,
    `app.json must not enable OAuth/auth callback wiring in 5.0B-core; found ${[...new Set(blocked)].join(", ")}`);
}

function assertSelfCheckSmoke() {
  const unsafeRe = /access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawEmail|providerIdentity|identity_data|currentPassword|current_password|newPassword|confirmPassword|owner_user_id|deleted_at|password|token|secret|credential/i;
  function findUnsafeIdentityKeys(obj, pathLabel = "root", out = []) {
    if (!obj || typeof obj !== "object") return out;
    for (const [key, value] of Object.entries(obj)) {
      const nextPath = `${pathLabel}.${key}`;
      if (unsafeRe.test(key)) out.push(nextPath);
      if (value && typeof value === "object") findUnsafeIdentityKeys(value, nextPath, out);
    }
    return out;
  }

  const safeSyncReady = {
    version: "0.1.0",
    status: "sync_ready",
    mode: "provider_backed",
    provider: "supabase",
    pendingEmail: null,
    emailVerified: true,
    profile: {
      id: "profile_1",
      userId: "user_1",
      email: "qa@example.com",
      emailVerified: true,
      displayName: "QA",
      workspaceId: "workspace_1",
      onboardingCompleted: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    workspace: {
      id: "workspace_1",
      ownerUserId: "user_1",
      name: "QA Workspace",
      origin: "provider_backed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    onboardingCompleted: true,
    lastError: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const unsafe = { ...safeSyncReady, access_token: "must-fail" };

  assert(findUnsafeIdentityKeys(safeSyncReady).length === 0,
    "selfCheck smoke: safe sync_ready fixture must not report violations");
  assert(findUnsafeIdentityKeys(unsafe).includes("root.access_token"),
    "selfCheck smoke: unsafe token-shaped key must be caught");
}

console.log("\n-- Identity Phase 5.0B mobile alignment validation --");

const packageJson = readJson(PACKAGE_REL);
const appJson = readJson(APP_JSON_REL);
const docs = read(DOC_REL);
const mobileConfig = read(MOBILE_CONFIG_REL);
const secureStore = read(SECURE_STORE_REL);
const mobileStorage = read(MOBILE_STORAGE_REL);
const selfCheck = read(SELF_CHECK_REL);
const provider = read(MOBILE_PROVIDER_REL);
const identityContext = read(IDENTITY_CONTEXT_REL);
const settings = read(SETTINGS_REL);
const identityDebug = read(IDENTITY_DEBUG_REL);

const srcFiles = walkFiles(MOBILE_SRC_REL, [".ts", ".tsx", ".js", ".jsx"]);
const mobileFiles = [
  ...srcFiles,
  PACKAGE_REL,
  APP_JSON_REL,
];

// 1-2. Dependencies.
const deps = packageJson.dependencies ?? {};
assert(deps["@h2o/identity-core"], "apps/studio-mobile/package.json must depend on @h2o/identity-core");
assert(deps["expo-secure-store"], "apps/studio-mobile/package.json must depend on expo-secure-store");
assert(deps["@supabase/supabase-js"], "apps/studio-mobile/package.json must depend on @supabase/supabase-js");

// 3. No browser-only APIs in mobile source.
assertNoMatches(srcFiles, /\bchrome\.|\bwindow\.|\blocalStorage\b|\bsessionStorage\b/g,
  "mobile source must not use browser-only APIs");

// 4-5 + extra import ownership.
assertOnlyFileImports(srcFiles, "expo-secure-store", SECURE_STORE_REL,
  "SecureStore wrapper ownership");
assertOnlyFileImports(srcFiles, "@react-native-async-storage/async-storage", MOBILE_STORAGE_REL,
  "AsyncStorage wrapper ownership");
assertOnlyFileImports(srcFiles, "@supabase/supabase-js", MOBILE_PROVIDER_REL,
  "Supabase SDK ownership");
for (const match of findSourceMatches(srcFiles, /\bAsyncStorage\.setItem\s*\(|\bsetItemAsync\s*\(/g)) {
  assert(match.rel === MOBILE_STORAGE_REL || match.rel === SECURE_STORE_REL,
    `storage writes are wrapper-only; found ${match.rel}:${match.line}`);
  if (match.text.includes("AsyncStorage.setItem")) assert(match.rel === MOBILE_STORAGE_REL,
    `AsyncStorage.setItem is only allowed in ${MOBILE_STORAGE_REL}; found ${match.rel}:${match.line}`);
}

// 6. Persistence sanitizer policy.
assert(/export\s+function\s+sanitizeForPersistence\b/.test(mobileStorage),
  "mobileStorage.ts must export sanitizeForPersistence()");
assert(/async\s+function\s+writeJson\s*\([^)]*\)[^{]*\{[\s\S]*AsyncStorage\.setItem\s*\(\s*key\s*,\s*JSON\.stringify\s*\(\s*sanitizeForPersistence\s*\(\s*value\s*\)\s*\)\s*\)/.test(mobileStorage),
  "mobileStorage.ts writeJson() must sanitize before AsyncStorage.setItem");
for (const fnName of ["writeSnapshot", "writeAudit", "writeSessionMeta"]) {
  const body = extractBlockByName(mobileStorage, fnName);
  assert(body.includes("writeJson("), `mobileStorage.ts ${fnName}() must route writes through sanitized writeJson()`);
}

// 7. Snapshot object-shape safety.
const getSnapshot = extractBlockByName(provider, "getSnapshot");
assert(/return\s+structuredCloneSafe\s*\(\s*this\.snapshot\s*\)/.test(getSnapshot),
  "MobileSupabaseProvider.getSnapshot() must return a structured clone of the internal snapshot");
const buildSnapshotFromRpc = extractBlockByName(provider, "buildSnapshotFromRpc");
assert(buildSnapshotFromRpc.includes("emailFallback") &&
  buildSnapshotFromRpc.includes("normalizeRpcProfile") &&
  buildSnapshotFromRpc.includes("normalizeRpcWorkspace") &&
  buildSnapshotFromRpc.includes("pendingEmail: profile?.email ? null : fallbackEmail"),
  "MobileSupabaseProvider.buildSnapshotFromRpc() must normalize RPC profile/workspace shape and preserve a safe email fallback");
assert(!/const\s+profile\s*=\s*result\?\.profile\s*\?\?\s*null/.test(provider),
  "MobileSupabaseProvider must not assign raw load_identity_state profile directly into public snapshots");
assert(!/buildSnapshotFromRpc\s*\(\s*rpcData\s+as\s+RpcIdentityState\s+\|\s+null\s*\)/.test(provider),
  "MobileSupabaseProvider post-auth RPC snapshots must pass a safe normalized email fallback");
assertNoUnsafeObjectKeys("makeAuthErrorSnapshot()", extractBlockByName(provider, "makeAuthErrorSnapshot"));
assertNoUnsafeObjectKeys("buildSnapshotFromRpc()", buildSnapshotFromRpc);
assert(selfCheck.includes("IDENTITY_NO_TOKEN_SURFACE_RE") &&
  selfCheck.includes("findUnsafeIdentityKeys") &&
  /access_token\|refresh_token\|provider_token\|provider_refresh_token/.test(selfCheck),
  "selfCheck.ts must enforce token/session/private-key shaped key detection");

// 8. Existing-user OTP path only; verify/setPassword recovery methods must not contain signInWithOtp.
// Relaxed for 5.0D: requestRecoveryCode is now a permitted call site for signInWithOtp
// because v1 recovery reuses the email-code transport (see 5.0D spec). The
// shouldCreateUser:false constraint is still enforced for every call site.
const signInOtpMatches = [...provider.matchAll(/signInWithOtp\s*\(/g)];
assert(signInOtpMatches.length >= 1, "Mobile provider must include signInWithOtp for existing-user email-code path");
for (const match of signInOtpMatches) {
  const before = provider.slice(0, match.index);
  const methodMatch = [...before.matchAll(/async\s+([A-Za-z_$][\w$]*)\s*\(/g)].at(-1);
  const methodName = methodMatch?.[1] ?? "unknown";
  assert(["signInWithEmail", "resendVerification", "requestRecoveryCode"].includes(methodName),
    `signInWithOtp is only allowed in existing-user email-code or recovery-request paths; found in ${methodName}`);
  const callWindow = provider.slice(match.index, match.index + 260);
  assert(/shouldCreateUser\s*:\s*false/.test(callWindow),
    `${methodName} signInWithOtp call must set shouldCreateUser:false`);
}
for (const fnName of ["verifyRecoveryCode", "setPasswordAfterRecovery"]) {
  assert(!extractBlockByName(provider, fnName).includes("signInWithOtp"),
    `${fnName} must not call signInWithOtp`);
}

// 9. SecureStore key.
assert(/REFRESH_TOKEN_KEY\s*=\s*['"]h2o\.identity\.provider\.refresh\.v1['"]/.test(secureStore),
  "secureStore.ts must use h2o.identity.provider.refresh.v1 as the refresh token key");

// 10. Capabilities literal.
const capabilitiesMatch = provider.match(/readonly\s+capabilities\s*:\s*ProviderCapabilities\s*=\s*\{([\s\S]*?)\};/);
assert(capabilitiesMatch, "MobileSupabaseProvider must declare a capabilities literal");
const capabilities = capabilitiesMatch[1];
for (const required of [
  "emailMagicLink: false",
  "emailOtp: true",
  "profileRead: true",
  "profileWrite: true",
  "persistentSession: true",
  "cloudSync: false",
]) {
  assert(capabilities.includes(required), `Mobile provider capabilities must include ${required}`);
}

// 11-12. No OAuth/auth callback wiring and no chrome.identity.
assertNoOauthCallbackConfig(appJson);
assertNoMatches(srcFiles, /from\s+['"]chrome\.identity['"]|chrome\.identity/g,
  "mobile source must not import/use chrome.identity");

// 13. Self-check smoke.
assertSelfCheckSmoke();

// 14. Supabase config policy and service-role ban.
for (const rel of srcFiles) {
  const source = read(rel);
  const hasEnvConfig = /EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_ANON_KEY/.test(source);
  assert(!hasEnvConfig || rel === MOBILE_CONFIG_REL,
    `Supabase public env config may only be read in ${MOBILE_CONFIG_REL}; found in ${rel}`);
  const hasHardCodedSupabaseUrl = /https:\/\/[A-Za-z0-9.-]+\.supabase\.co/.test(source);
  assert(!hasHardCodedSupabaseUrl || rel === MOBILE_CONFIG_REL,
    `Hard-coded Supabase URL literals are only allowed in ${MOBILE_CONFIG_REL}; found in ${rel}`);
  assertNoServiceRole(rel, source);
}
for (const rel of [PACKAGE_REL, APP_JSON_REL]) assertNoServiceRole(rel, read(rel));

// 15. Boot restore timeout.
const timeoutMatch = mobileConfig.match(/export\s+const\s+BOOT_RESTORE_TIMEOUT_MS\s*=\s*(\d+)/);
assert(timeoutMatch, "mobileConfig.ts must export numeric BOOT_RESTORE_TIMEOUT_MS");
const timeoutMs = Number(timeoutMatch[1]);
assert(Number.isFinite(timeoutMs) && timeoutMs >= 3000 && timeoutMs <= 5000,
  `BOOT_RESTORE_TIMEOUT_MS must be in [3000, 5000]; found ${timeoutMs}`);

// 16. Recovery gate (relaxed for 5.0D — implementations may exist behind the
// RECOVERY_FLOW_VERIFIED flag; flag=true requires the 5.0D Recovery Closeout
// doc to record the live-inbox QA matrix as PASS. Source-level asserts on the
// recovery implementation itself live in validate-identity-phase5_0d-recovery.mjs,
// which runs alongside this validator in the identity release gate.)
const recoveryFlagMatch = mobileConfig.match(/export\s+const\s+RECOVERY_FLOW_VERIFIED\s*=\s*(true|false)/);
assert(recoveryFlagMatch, "mobileConfig.ts must export RECOVERY_FLOW_VERIFIED");
const recoveryFlowVerified = recoveryFlagMatch[1] === "true";
if (recoveryFlowVerified) {
  // Read the 5.0D closeout doc directly from its known path. (Earlier this
  // gate tested against the `docs` variable, but `docs` is loaded from
  // DOC_REL = 5.0A — so the regex never matched. Bug fixed here.)
  let closeout = "";
  try { closeout = read(RECOVERY_CLOSEOUT_REL); } catch { /* missing → fail below */ }
  assert(/Phase 5\.0D Recovery Closeout[\s\S]*Live[\-\s]?inbox QA[\s\S]*\bPASS\b/i.test(closeout),
    "RECOVERY_FLOW_VERIFIED=true requires Phase 5.0D Recovery Closeout doc to record live-inbox QA matrix as PASS");
}
// Universal forbids — apply regardless of flag state.
assertNoMatches(srcFiles, /type\s*:\s*['"]recovery['"]|resetPasswordForEmail/g,
  "active recovery primitives forbidden in mobile source (resetPasswordForEmail, type:'recovery')");
// identity-debug.tsx must remain inert with respect to recovery — even after the
// 5.0D implementation lands. Recovery is exercised through /account-identity, not
// through the QA debug surface.
assert(identityDebug.includes("Recovery pending live inbox verification"),
  "identity-debug.tsx may expose only an inert recovery placeholder");
assert(!/requestRecoveryCode\s*\(|verifyRecoveryCode\s*\(|setPasswordAfterRecovery\s*\(/.test(identityDebug),
  "identity-debug.tsx must not call recovery actions");

// Extra 5.0B-core ownership checks.
assert(!/@supabase\/supabase-js|expo-secure-store|@react-native-async-storage\/async-storage/.test(identityContext),
  "IdentityContext.tsx must not directly import Supabase, SecureStore, or AsyncStorage");
assert(identityContext.includes("MobileSupabaseProvider"),
  "IdentityContext.tsx must wrap MobileSupabaseProvider");
assert(settings.includes("useIdentity") &&
  !/@supabase\/supabase-js|expo-secure-store|@react-native-async-storage\/async-storage/.test(settings),
  "settings.tsx must use useIdentity and no direct provider/storage imports");
assert(identityDebug.includes("useIdentity") &&
  !/@supabase\/supabase-js|expo-secure-store|@react-native-async-storage\/async-storage/.test(identityDebug),
  "identity-debug.tsx must use useIdentity and no direct provider/storage imports");
assert(!/\b(OAuth|oauth|resetPasswordForEmail|access_token|refresh_token|rawSession|rawUser)\b/.test(settings),
  "settings.tsx must not expose OAuth, active recovery, or raw token/session strings");
assert(!/\b(OAuth|oauth|billing|resetPasswordForEmail|access_token|refresh_token|rawSession|rawUser)\b/.test(identityDebug),
  "identity-debug.tsx must not expose OAuth, billing, active recovery, or raw token/session strings");

console.log("PASS: Identity Phase 5.0B mobile alignment validator");
