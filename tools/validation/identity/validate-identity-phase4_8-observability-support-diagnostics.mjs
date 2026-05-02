// Identity Phase 4.8 validation - Observability / support diagnostics policy.
// Static only; no Supabase/network access and no storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const ACCOUNT_PLUGIN_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const BILLING_CORE_REL = "scripts/0D5a.⬛️💳 Billing Core 💳.js";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_8-observability-support-diagnostics.mjs";

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

function assertNoPageProviderOwnership(label, source) {
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: page/UI/loader must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: page/UI/loader must not import/probe provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: page/UI/loader must not call Supabase directly`);
}

function assertNoPublicPrivateFields(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose token/session/raw auth/provider/private DB fields`);
  assert(!/\b(service_role|service-role|serviceRoleKey|SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY)\b/.test(source),
    `${label}: must not expose service-role strings`);
}

function assertNoRuntimeAdminSurface(label, source) {
  assert(!/\b(service_role|service-role|serviceRoleKey|SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY)\b/.test(source),
    `${label}: runtime must not contain service-role strings`);
  assert(!/\b(auth\.admin|supabaseAdmin|admin\.deleteUser|deleteUser\s*\()\b/.test(source),
    `${label}: runtime must not use admin APIs`);
}

function assertNoSensitiveLogging(label, source) {
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!/console\.(?:log|warn|error|info|debug)\s*\(/.test(line)) continue;
    assert(!/\b(password|currentPassword|current_password|otp|code|token|secret|rawSession|rawUser|providerResponse|providerResult|payload|request|response|req|extra)\b/i.test(line),
      `${label}: console logging must not include sensitive payload wording at line ${index + 1}`);
  }
}

function assertNoPasswordCodePersistence(label, source) {
  assert(!/(localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*(?:password|currentPassword|current_password|code|otp|recovery)/i.test(source),
    `${label}: password/code/recovery values must not use page storage`);
  assert(!/chrome\.storage\.(?:local|session)[\s\S]{0,220}(?:password\s*:|currentPassword|current_password|code\s*:|otp\s*:|recoveryToken|recovery_token)/i.test(source),
    `${label}: password/code/recovery payloads must not be written to chrome storage`);
}

console.log("\n-- Identity Phase 4.8 observability/support diagnostics validation --");

const docs = read(DOC_REL);
const identityCore = read(IDENTITY_CORE_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const billingCore = read(BILLING_CORE_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.8B - Observability / Support Diagnostics Policy Gate") &&
  docs.includes("Public-safe diagnostics") &&
  docs.includes("Dev-only/internal diagnostics") &&
  docs.includes("Never-expose fields") &&
  docs.includes("Support bundle allowlist principle") &&
  docs.includes("Redaction policy") &&
  docs.includes("Safe error taxonomy") &&
  docs.includes("Logging policy") &&
  docs.includes("access_token") &&
  docs.includes("refresh_token") &&
  docs.includes("provider_token") &&
  docs.includes("raw session objects") &&
  docs.includes("raw user objects") &&
  docs.includes("raw email") &&
  docs.includes("service-role keys") &&
  docs.includes("private billing, customer, payment, checkout, portal, or Stripe identifiers") &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must document Phase 4.8B diagnostics policy, redaction, taxonomy, logging, and validator commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.8 observability/support diagnostics validator");

const diag = extractFunction(identityCore, "diag");
const selfCheck = extractFunction(identityCore, "selfCheck");
const sendBridgeDirectRaw = extractFunction(identityCore, "sendBridgeDirectRaw");
const sendBridgeRelayRaw = extractFunction(identityCore, "sendBridgeRelayRaw");
const sendBridgeRaw = extractFunction(identityCore, "sendBridgeRaw");
const recordAudit = extractFunction(identityCore, "recordAudit");
const sanitizeAuditMeta = extractFunction(identityCore, "sanitizeAuditMeta");

assert(diag.includes("pendingEmail: maskEmail(snapshot.pendingEmail)") &&
  diag.includes("profileEmail: maskEmail(snapshot.profile?.email)") &&
  diag.includes("credentialState: normalizeCredentialState(snapshot.credentialState)") &&
  diag.includes("credentialProvider: normalizeCredentialProvider(snapshot.credentialProvider)") &&
  diag.includes("lastError: snapshot.lastError ? { ...snapshot.lastError, detail: undefined } : null") &&
  !/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(diag) &&
  !/\b(password|currentPassword|current_password|recoveryToken|recovery_token)\b/i.test(diag),
  "H2O.Identity.diag() must expose safe masked/status fields only and strip error detail");
assert(selfCheck.includes("noTokenSurface") &&
  selfCheck.includes("diag: diag()") &&
  !/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(selfCheck),
  "H2O.Identity.selfCheck() must rely on safe diag and token-surface check");
assert(recordAudit.includes("sanitizeAuditMeta(meta)") &&
  sanitizeAuditMeta.includes("/token|secret|password|refresh/i") &&
  !/console\.(?:log|warn|error|info|debug)/.test(recordAudit + "\n" + sanitizeAuditMeta),
  "Identity audit entries must be sanitized and not logged");
for (const [name, body] of [
  ["sendBridgeDirectRaw", sendBridgeDirectRaw],
  ["sendBridgeRelayRaw", sendBridgeRelayRaw],
  ["sendBridgeRaw", sendBridgeRaw],
]) {
  assert(body && !/console\.(?:log|warn|error|info|debug)/.test(body),
    `${name} must not log identity bridge payloads or responses`);
}

const renderDiag = extractFunction(identitySurfaceJs, "renderDiag");
assert(renderDiag.includes("api.diag()") &&
  renderDiag.includes("JSON.stringify(api.diag(), null, 2)") &&
  !/getSnapshot|chrome\.storage|localStorage|sessionStorage|sendBridgeRaw|sendBridge\(/.test(renderDiag),
  "onboarding diagnostics must render api.diag() only");
assertNoPageProviderOwnership("identity onboarding surface JS", identitySurfaceJs);
assertNoPublicPrivateFields("identity onboarding surface JS", identitySurfaceJs);
assertNoPublicPrivateFields("identity onboarding surface HTML", identitySurfaceHtml);

const renderStatus = extractFunction(accountPlugin, "renderStatus");
assert(renderStatus.includes("api.diag?.()") &&
  renderStatus.includes("api.getSnapshot?.()") &&
  renderStatus.includes("d.lastError.code") &&
  !/chrome\.storage|localStorage|sessionStorage|sendBridgeRaw|sendBridge\(|\.rpc\s*\(|\.from\s*\(/.test(renderStatus),
  "Account tab diagnostics/status must derive from public snapshot/diag facade fields only");
assertNoPageProviderOwnership("Control Hub Account plugin", accountPlugin);
assertNoPublicPrivateFields("Control Hub Account plugin", renderStatus);

const clearSignOutLocalState = extractFunction(background, "identityAuthManager_clearSignOutLocalState");
const signOut = extractFunction(background, "identityAuthManager_signOut");
const publishSafeRuntime = extractFunction(background, "identityProviderSession_publishSafeRuntime");
assert(clearSignOutLocalState.includes("const diagnostics =") &&
  clearSignOutLocalState.includes("activeSessionRemoveAttempted") &&
  clearSignOutLocalState.includes("persistentRemoveAttempted") &&
  clearSignOutLocalState.includes("passwordUpdateMarkerRemoveAttempted") &&
  clearSignOutLocalState.includes("oauthFlowRemoveAttempted") &&
  clearSignOutLocalState.includes("return { ok, diagnostics }"),
  "background may keep cleanup diagnostics internally");
assert(signOut.includes("const cleanup = await identityAuthManager_clearSignOutLocalState()") &&
  signOut.includes('return { ok: true, nextStatus: "anonymous_local" }') &&
  !/\bdiagnostics\b/.test(signOut.replace("const cleanup = await identityAuthManager_clearSignOutLocalState()", "")),
  "sign-out bridge response must not return cleanup diagnostics publicly");
assert(publishSafeRuntime.includes("identityProviderSession_publishSafeRuntime") &&
  publishSafeRuntime.includes("identitySnapshot_fromRuntime(runtime)") &&
  publishSafeRuntime.includes("broadcastIdentityPush(safeSnapshot)") &&
  !/\brawSession\s*:/.test(publishSafeRuntime) &&
  !/\brawUser\s*:/.test(publishSafeRuntime) &&
  !/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawOAuth)\b/.test(publishSafeRuntime),
  "safe runtime publishing must sanitize through snapshots and must not return raw session/user/token fields");

assert(provider.includes("mapProviderOtpError") &&
  provider.includes("mapProviderOAuthError") &&
  provider.includes("mapProviderRefreshError") &&
  provider.includes("mapProviderIdentityLoadError") &&
  provider.includes("errorCode:") &&
  !/return\s+\{\s*ok:\s*false\s*,\s*error\s*:/.test(provider) &&
  !/return\s+\{\s*ok:\s*false[\s\S]{0,120}rawError/.test(provider),
  "provider errors must be normalized to safe errorCode values, not raw errors");

for (const [label, source] of [
  ["extension background", background],
  ["identity provider", provider],
  ["loader", loader],
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity onboarding JS", identitySurfaceJs],
  ["identity onboarding HTML", identitySurfaceHtml],
  ["Billing Core", billingCore],
]) {
  assertNoSensitiveLogging(label, source);
  assertNoPasswordCodePersistence(label, source);
}

for (const [label, source] of [
  ["extension background", background],
  ["identity provider", provider],
  ["loader", loader],
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity onboarding JS", identitySurfaceJs],
  ["identity onboarding HTML", identitySurfaceHtml],
]) {
  assertNoRuntimeAdminSurface(label, source);
}

for (const [label, source] of [
  ["loader", loader],
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity onboarding JS", identitySurfaceJs],
  ["identity onboarding HTML", identitySurfaceHtml],
]) {
  assert(!/\b(rawEmail|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(source),
    `${label}: public/page/loader diagnostics must not mention raw auth/provider/private fields`);
}

console.log("  diagnostics policy docs are present");
console.log("  H2O.Identity.diag/selfCheck expose safe masked/status fields only");
console.log("  onboarding diagnostics render api.diag() only");
console.log("  Account tab status uses public snapshot/diag fields only");
console.log("  background cleanup diagnostics stay out of public sign-out responses");
console.log("  provider errors are normalized to safe error codes");
console.log("  logging, storage, service-role/admin, and public leak checks passed");
console.log("\nIdentity Phase 4.8 observability/support diagnostics validation PASSED");
