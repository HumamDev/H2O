// Identity Phase 4.7 validation - Production deployment gate.
// Static only; no deployment, network access, secret reads, or storage mutation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const GITIGNORE_REL = ".gitignore";
const MANIFEST_SOURCE_REL = "tools/product/extension/chrome-live-manifest.mjs";
const BUILD_SOURCE_REL = "tools/product/extension/build-chrome-live-extension.mjs";
const PROD_MANIFEST_REL = "build/chrome-ext-prod/manifest.json";
const PROD_PRIVATE_CONFIG_REL = "build/chrome-ext-prod/provider/identity-provider-private-config.js";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BILLING_PROVIDER_REL = "tools/product/billing/billing-provider-supabase.entry.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const ACCOUNT_PLUGIN_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_7-production-deployment-gate.mjs";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function assertNoRuntimeSecretSurface(label, source) {
  assert(!/\b(service_role|service-role|serviceRoleKey|SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY)\b/.test(source),
    `${label}: must not contain service-role strings`);
  assert(!/\b(auth\.admin|supabaseAdmin|admin\.deleteUser|deleteUser\s*\()\b/.test(source),
    `${label}: must not use admin APIs or auth user deletion`);
}

function assertNoPublicSecretSurface(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose token/session/raw auth/private DB fields`);
}

console.log("\n-- Identity Phase 4.7 production deployment gate validation ------");

const docs = read(DOC_REL);
const gitignore = read(GITIGNORE_REL);
const manifestSource = read(MANIFEST_SOURCE_REL);
const buildSource = read(BUILD_SOURCE_REL);
const prodManifest = readJson(PROD_MANIFEST_REL);
const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const billingProvider = read(BILLING_PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.7B - Production Deployment Gate") &&
  docs.includes("Production Supabase project checklist") &&
  docs.includes("Supabase Auth settings checklist") &&
  docs.includes("Email/password") &&
  docs.includes("Email OTP / recovery code") &&
  docs.includes("SMTP sender") &&
  docs.includes("Google OAuth production redirect checklist") &&
  docs.includes("Chrome Web Store production extension ID") &&
  docs.includes("Production manifest host permissions remain narrow") &&
  docs.includes("Provider config and secret hygiene") &&
  docs.includes("Live RLS gate command") &&
  docs.includes("H2O_SUPABASE_RLS_LIVE_REQUIRED=1") &&
  docs.includes("Billing/Stripe production readiness boundary") &&
  docs.includes("Rollback plan") &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must contain the Phase 4.7B production deployment checklist and validator commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.7 production deployment gate validator");

const prodHostPermissions = array(prodManifest.host_permissions);
const prodOptionalHostPermissions = array(prodManifest.optional_host_permissions);
const prodAllHosts = [...prodHostPermissions, ...prodOptionalHostPermissions];
assert(prodHostPermissions.length === 1 && prodHostPermissions[0] === "https://chatgpt.com/*",
  "production manifest host_permissions must be exactly https://chatgpt.com/*");
assert(!prodAllHosts.includes("*://*/*") && !prodAllHosts.some((value) => /^\*:\/\/|\/\*$/.test(value) && value !== "https://chatgpt.com/*" && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/\*$/.test(value)),
  "production manifest must not include wildcard host permissions except approved exact Supabase optional host patterns");
assert(!prodManifest.externally_connectable,
  "production manifest must not include externally_connectable");
assert(!array(prodManifest.permissions).includes("identity"),
  "default production manifest must not include chrome identity permission unless built as an explicitly OAuth-enabled profile");
assert(!exists(PROD_PRIVATE_CONFIG_REL),
  "production build output must not emit provider/identity-provider-private-config.js in the current gate");

assert(manifestSource.includes('manifestProfile === "production"') &&
  manifestSource.includes("? [CHAT_MATCH]") &&
  manifestSource.includes("manifestProfile !== \"production\"") &&
  manifestSource.includes("manifest.externally_connectable") &&
  manifestSource.includes('if (oauthGoogleEnabled) permissions.push("identity")') &&
  manifestSource.includes("/^https:\\/\\/[a-z0-9-]+\\.supabase\\.co\\/\\*$/"),
  "manifest generator must keep production hosts narrow, externally_connectable dev-only, OAuth identity permission gated, and optional Supabase hosts exact");

assert(gitignore.includes("config/local/identity-provider.local.json"),
  "identity-provider.local.json must remain ignored/local-only");
assert(!/\b(?:identity-provider\.local\.json|\.env(?:\.|$))\b/.test(background + provider + billingProvider + loader + identityCore + accountPlugin + identitySurfaceJs + identitySurfaceHtml),
  "runtime/page/provider sources must not reference local config or .env files as committed runtime config");
assert(buildSource.includes("IDENTITY_PROVIDER_LOCAL_CONFIG_REL") &&
  buildSource.includes("identity-provider.local.json") &&
  buildSource.includes("readIdentityProviderLocalJsonConfig") &&
  buildSource.includes("MANIFEST_PROFILE === \"production\"") &&
  buildSource.includes("return { status: null, privateConfig: null };"),
  "builder may read ignored local identity config for non-production/dev config only and must suppress private config for production");

for (const [label, source] of [
  ["extension background", background],
  ["identity provider", provider],
  ["billing provider", billingProvider],
  ["loader", loader],
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
]) {
  assertNoRuntimeSecretSurface(label, source);
}

for (const [label, source] of [
  ["loader", loader],
  ["Identity Core", identityCore],
  ["Control Hub Account plugin", accountPlugin],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
]) {
  assertNoPublicSecretSurface(label, source);
}

assert(docs.includes("Supabase Auth Redirect URLs include the exact production URL `https://<production-extension-id>.chromiumapp.org/identity/oauth/google`") &&
  docs.includes("Production Supabase redirect URLs do not use wildcards") &&
  docs.includes("Google Cloud OAuth client type is `Web application`") &&
  docs.includes("Google’s authorized redirect URI is the Supabase callback URL, not the chromiumapp URL"),
  "docs must capture Google OAuth production redirect requirements");
assert(docs.includes("The service-role key is allowed only in the local live RLS validator environment") &&
  docs.includes("It must never appear in extension source, generated extension output, provider runtime, loader, UI, public snapshots, committed config, or browser storage."),
  "docs must confine service-role usage to live validator env and server-only contexts");
assert(docs.includes("STRIPE_SECRET_KEY") &&
  docs.includes("STRIPE_WEBHOOK_SECRET") &&
  docs.includes("deployed only as Supabase Edge Function environment secrets/config") &&
  docs.includes("Billing service-role usage remains Edge Function only"),
  "docs must keep billing production secrets server-side as Edge Function environment config only");

console.log("  production deployment checklist is documented");
console.log("  production manifest remains narrow");
console.log("  local config remains ignored and production private config is absent");
console.log("  service-role/admin APIs are absent from extension runtime surfaces");
console.log("  OAuth, live RLS, and billing production gates are documented");
console.log("\nIdentity Phase 4.7 production deployment gate validation PASSED");
