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
const A3_AMENDMENT_DOC_REL = "docs/identity/IDENTITY_AMENDMENT_4_X_A3_DIAG_RUNTIME.md";

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
const a3AmendmentDoc = read(A3_AMENDMENT_DOC_REL);

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

// Amendment 4.X.A3 — diag().runtime safe-metadata allowance.
// The amendment doc must exist and define the four allowed keys.
assert(a3AmendmentDoc.includes("Amendment 4.X.A3") &&
  a3AmendmentDoc.includes("diag().runtime") &&
  a3AmendmentDoc.includes("platform") &&
  a3AmendmentDoc.includes("runtimeKind") &&
  a3AmendmentDoc.includes("appVersion") &&
  a3AmendmentDoc.includes("identityCoreVersion"),
  "Amendment 4.X.A3 doc must define the safe diag().runtime shape (platform, runtimeKind, appVersion, identityCoreVersion)");

// Forward-compatible shape enforcement: if diag() declares a `runtime` property in any form
// (explicit `runtime: { ... }`, shorthand `{ runtime }`, function-call assignment, identifier
// assignment), the validator must be able to verify the safe shape statically. Therefore the
// declaration MUST be an inline object literal. Anything else fails fast with a clear message.
// The runtime currently does not emit `diag().runtime`, so all checks below are no-ops until
// 5.0B (or a future change) opts in.
const A3_DIAG_RUNTIME_REQUIRED_KEYS = ["platform", "runtimeKind", "appVersion", "identityCoreVersion"];
const A3_DIAG_RUNTIME_VALUE_RULES = {
  platform: { kind: "enum", values: ["browser-extension", "studio-mobile"] },
  runtimeKind: { kind: "enum", values: ["chrome-mv3", "expo-ios", "expo-android"] },
  appVersion: { kind: "nonEmptyString" },
  identityCoreVersion: { kind: "nonEmptyString" },
};
// Property-key context for `runtime`: line-start indentation, or immediately following `{` or
// `,` (with optional whitespace). Excludes member-access cases like `chrome.runtime`.
const A3_RUNTIME_PROP_KEY_REGEX = /(?:^[ \t]*|[{,]\s*)runtime\b/gm;
const a3RuntimeKeyHits = [...diag.matchAll(A3_RUNTIME_PROP_KEY_REGEX)];

if (a3RuntimeKeyHits.length > 0) {
  // At most one `runtime` property declaration. JS object literals tolerate duplicate keys
  // outside strict mode (last-wins); the validator must NOT silently accept that, because a
  // second declaration could be a non-literal that bypasses shape enforcement.
  assert(a3RuntimeKeyHits.length === 1,
    "Amendment 4.X.A3: diag() must not declare more than one runtime property.");

  // The single declaration must be `runtime: { ... }` — explicit colon, then `{`.
  for (const hit of a3RuntimeKeyHits) {
    const afterRuntime = diag.slice(hit.index + hit[0].length);
    const sepMatch = afterRuntime.match(/^\s*(\S)/);
    assert(sepMatch && sepMatch[1] === ':',
      "Amendment 4.X.A3: diag().runtime must be an inline object literal so the validator can enforce its safe shape.");
    const afterColon = afterRuntime.slice(afterRuntime.indexOf(':') + 1);
    const valStartMatch = afterColon.match(/^\s*(\S)/);
    assert(valStartMatch && valStartMatch[1] === '{',
      "Amendment 4.X.A3: diag().runtime must be an inline object literal so the validator can enforce its safe shape.");
  }

  // Brace-match the single occurrence to extract the literal body. (The single-occurrence
  // contract was asserted above, so we know there is exactly one hit to inspect.)
  const firstHit = a3RuntimeKeyHits[0];
  const a3OpenIdx = diag.indexOf('{', firstHit.index + firstHit[0].length);
  let a3Depth = 0;
  let a3CloseIdx = -1;
  for (let i = a3OpenIdx; i < diag.length; i += 1) {
    if (diag[i] === '{') a3Depth += 1;
    else if (diag[i] === '}') {
      a3Depth -= 1;
      if (a3Depth === 0) { a3CloseIdx = i; break; }
    }
  }
  assert(a3CloseIdx > a3OpenIdx,
    "Amendment 4.X.A3: diag().runtime inline literal has unmatched braces");
  const a3RuntimeBody = diag.slice(a3OpenIdx + 1, a3CloseIdx);

  // Collect top-level keys.
  const a3ObservedKeys = [...a3RuntimeBody.matchAll(/(?:^|[,\n])\s*([A-Za-z_$][\w$]*)\s*:/g)].map(match => match[1]);

  // No extra keys.
  for (const key of a3ObservedKeys) {
    assert(A3_DIAG_RUNTIME_REQUIRED_KEYS.includes(key),
      `Amendment 4.X.A3: diag().runtime may only contain ${A3_DIAG_RUNTIME_REQUIRED_KEYS.join(", ")}; found unauthorized key "${key}"`);
  }

  // No duplicate keys.
  const a3DuplicateKeys = a3ObservedKeys.filter((key, idx) => a3ObservedKeys.indexOf(key) !== idx);
  assert(a3DuplicateKeys.length === 0,
    `Amendment 4.X.A3: diag().runtime must not declare duplicate keys; found duplicates: ${[...new Set(a3DuplicateKeys)].join(", ")}`);

  // All four required keys present.
  const a3ObservedKeySet = new Set(a3ObservedKeys);
  const a3MissingKeys = A3_DIAG_RUNTIME_REQUIRED_KEYS.filter(key => !a3ObservedKeySet.has(key));
  assert(a3MissingKeys.length === 0,
    `Amendment 4.X.A3: diag().runtime must contain all four keys (${A3_DIAG_RUNTIME_REQUIRED_KEYS.join(", ")}); missing: ${a3MissingKeys.join(", ")}`);

  // No nested object literals, no arrays, no spread, no computed keys.
  assert(!/[A-Za-z_$][\w$]*\s*:\s*\{/.test(a3RuntimeBody),
    "Amendment 4.X.A3: diag().runtime must not contain nested objects");
  assert(!/[A-Za-z_$][\w$]*\s*:\s*\[/.test(a3RuntimeBody),
    "Amendment 4.X.A3: diag().runtime must not contain arrays");
  assert(!/\.\.\./.test(a3RuntimeBody),
    "Amendment 4.X.A3: diag().runtime must not use spread syntax");
  assert(!/^\s*\[/m.test(a3RuntimeBody),
    "Amendment 4.X.A3: diag().runtime must not use computed property keys");

  // Per-property value check:
  //   - must be a plain quoted string literal (no template literals, identifiers, calls,
  //     concatenation, fallbacks)
  //   - platform / runtimeKind values must match their enum
  //   - appVersion / identityCoreVersion must be non-empty strings
  // Split into property declarations, handling both multi-line and single-line literals.
  // String values in valid inputs (platform / runtimeKind enums, version numbers) do not
  // contain `,` or `\n`, so a top-level split is safe. Pathological values containing those
  // characters would fail the per-key string-literal check below.
  for (const propLine of a3RuntimeBody.split(/[\n,]/).map(s => s.trim()).filter(Boolean)) {
    const cleaned = propLine;
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx < 0) continue;
    const keyName = cleaned.slice(0, colonIdx).trim();
    if (!A3_DIAG_RUNTIME_REQUIRED_KEYS.includes(keyName)) continue;
    const valueExpr = cleaned.slice(colonIdx + 1).trim();
    const isQuotedLiteral =
      (valueExpr.startsWith("'") && valueExpr.endsWith("'") && valueExpr.length >= 2) ||
      (valueExpr.startsWith('"') && valueExpr.endsWith('"') && valueExpr.length >= 2);
    assert(isQuotedLiteral,
      `Amendment 4.X.A3: diag().runtime values must be quoted string literals; property "${keyName}" has non-literal value`);
    assert(!valueExpr.includes('`'),
      `Amendment 4.X.A3: diag().runtime values must be plain string literals (no template literals); property "${keyName}" appears to use template literal`);
    assert(!/[+]/.test(valueExpr.slice(1, -1)),
      `Amendment 4.X.A3: diag().runtime values must be plain string literals (no concatenation); property "${keyName}" contains "+" outside the literal`);
    const innerValue = valueExpr.slice(1, -1);
    const rule = A3_DIAG_RUNTIME_VALUE_RULES[keyName];
    if (rule.kind === "enum") {
      assert(rule.values.includes(innerValue),
        `Amendment 4.X.A3: diag().runtime."${keyName}" must be one of ${rule.values.map(v => `'${v}'`).join(", ")}; found '${innerValue}'`);
    } else if (rule.kind === "nonEmptyString") {
      assert(innerValue.length > 0,
        `Amendment 4.X.A3: diag().runtime."${keyName}" must be a non-empty string literal`);
    }
  }

  // No token / secret / password / credential / raw-auth-shaped substrings within the body.
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawEmail|rawOAuth|providerIdentity|identity_data|owner_user_id|deleted_at|service_role|service-role|serviceRoleKey|SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|recoveryToken|recovery_token|currentPassword|current_password|newPassword|confirmPassword)\b/i.test(a3RuntimeBody),
    "Amendment 4.X.A3: diag().runtime must not contain token/session/raw/recovery/password-shaped key names");
  assert(!/\b(secret|credential)\b/i.test(a3RuntimeBody),
    "Amendment 4.X.A3: diag().runtime must not contain secret-/credential-shaped key names");
}
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
console.log("  Amendment 4.X.A3: diag().runtime shape contract enforced (forward-compatible; no runtime emission today)");
console.log("  onboarding diagnostics render api.diag() only");
console.log("  Account tab status uses public snapshot/diag fields only");
console.log("  background cleanup diagnostics stay out of public sign-out responses");
console.log("  provider errors are normalized to safe error codes");
console.log("  logging, storage, service-role/admin, and public leak checks passed");
console.log("\nIdentity Phase 4.8 observability/support diagnostics validation PASSED");
