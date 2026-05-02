// Identity Phase 4.6 validation - Privacy, data export, and deletion visibility gate.
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
const BILLING_CORE_REL = "scripts/0D5a.⬛️💳 Billing Core 💳.js";
const RELEASE_RUNNER_REL = "tools/validation/identity/run-identity-release-gate.mjs";
const VALIDATOR_REL = "tools/validation/identity/validate-identity-phase4_6-privacy-data-lifecycle.mjs";

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

function assertNoPublicLeak(label, source) {
  assert(!/\b(access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawOAuth|owner_user_id|deleted_at)\b/.test(source),
    `${label}: must not expose tokens, raw auth data, raw email-adjacent fields, or private DB fields`);
  assert(!/@supabase\/supabase-js|@supabase\//i.test(source),
    `${label}: must not import Supabase SDK`);
  assert(!/identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/.test(source),
    `${label}: must not import/probe provider bundle`);
  assert(!/\.rpc\s*\(|\.from\s*\(\s*['"`]/.test(source),
    `${label}: must not call Supabase directly`);
}

console.log("\n-- Identity Phase 4.6 privacy/data lifecycle validation ---------");

const docs = read(DOC_REL);
const accountPlugin = read(ACCOUNT_PLUGIN_REL);
const background = read(BACKGROUND_REL);
const provider = read(PROVIDER_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const billingCore = read(BILLING_CORE_REL);
const releaseRunner = read(RELEASE_RUNNER_REL);

assert(docs.includes("Phase 4.6B - Privacy/Data Visibility Gate") &&
  docs.includes("display and validation only") &&
  docs.includes("does not implement export") &&
  docs.includes("does not implement") &&
  docs.includes("account deletion") &&
  docs.includes("Sign out") &&
  docs.includes("clears this browser only") &&
  docs.includes("not account deletion") &&
  docs.includes("Billing records") &&
  docs.includes("retention requirements") &&
  docs.includes(`node ${VALIDATOR_REL}`) &&
  docs.includes(`node --check ${VALIDATOR_REL}`),
  "docs must document Phase 4.6B privacy/data lifecycle policy and validator commands");
assert(releaseRunner.includes(VALIDATOR_REL),
  "release runner must include the Phase 4.6 privacy/data lifecycle validator");

const renderIdentitySectionBody = extractFunction(accountPlugin, "renderIdentitySectionBody");
const renderPrivacyDataSettings = extractFunction(accountPlugin, "renderPrivacyDataSettings");
assert(accountPlugin.includes("['privacy', 'Privacy & Data']") &&
  renderIdentitySectionBody.includes("key === 'privacy'") &&
  renderIdentitySectionBody.includes("renderPrivacyDataSettings()"),
  "Account Identity tabs must include a dedicated Privacy & Data section");
assert(renderPrivacyDataSettings.includes("'Privacy & Data'") &&
  renderPrivacyDataSettings.includes("Clears identity state on this browser only") &&
  renderPrivacyDataSettings.includes("It is not account deletion.") &&
  renderPrivacyDataSettings.includes("Local H2O data") &&
  renderPrivacyDataSettings.includes("Cloud identity data") &&
  renderPrivacyDataSettings.includes("Billing records") &&
  renderPrivacyDataSettings.includes("retention requirements"),
  "Privacy & Data UI must explain sign-out, local data, cloud identity data, and billing data separation");
assert(renderPrivacyDataSettings.includes("Export local data") &&
  renderPrivacyDataSettings.includes("Delete local data") &&
  renderPrivacyDataSettings.includes("Export cloud account data") &&
  renderPrivacyDataSettings.includes("Delete account") &&
  renderPrivacyDataSettings.includes("Deferred. Local export is not implemented in this phase.") &&
  renderPrivacyDataSettings.includes("Deferred. Local data deletion is not implemented in this phase.") &&
  renderPrivacyDataSettings.includes("Deferred. Cloud account export is not implemented in this phase.") &&
  renderPrivacyDataSettings.includes("Deferred. Account deletion requires a separate approved design and implementation."),
  "Privacy & Data UI must show export/delete/account deletion as deferred rows");
assert(!renderPrivacyDataSettings.includes("renderAccountActionSection") &&
  !/\{\s*label:\s*['"`](?:Export local data|Delete local data|Export cloud account data|Delete account)['"`][\s\S]{0,160}\baction\s*:/.test(renderPrivacyDataSettings),
  "Privacy & Data deferred rows must not be actionable buttons");
assert(!/\b(identity|account|privacy):(?:export|delete|erase|destroy|remove-account|delete-account)\b/i.test(renderPrivacyDataSettings),
  "Privacy & Data UI must not introduce export/delete bridge action names");

const identityRuntime = [
  accountPlugin,
  background,
  provider,
  loader,
  identityCore,
  identitySurfaceJs,
  identitySurfaceHtml,
].join("\n");

assert(!/\bdeleteUser\s*\(|\bauth\.admin\b|admin\.deleteUser|supabaseAdmin|SERVICE_ROLE|service[_-]?role/i.test(identityRuntime),
  "identity runtime must not use admin APIs, service-role runtime, or auth user deletion");
assert(!/\bidentity:(?:delete-account|delete-user|erase-account|export-account-data|export-cloud-data|delete-local-data|export-local-data)\b/i.test(identityRuntime),
  "no identity export/delete/account-deletion bridge action may be introduced");
assert(!/\b(?:deleteAccount|deleteUser|eraseAccount|exportAccountData|exportCloudData|deleteLocalData|exportLocalData|accountDeletion)\b/.test(identityRuntime),
  "no identity export/delete/account-deletion runtime helper may be introduced");
assert(!/create\s+(?:or\s+replace\s+)?function\s+public\.(?:delete|export|erase)_/i.test(identityRuntime),
  "no destructive/export RPC definition may be introduced in runtime sources");

const billingDeletionPatterns = /\b(billing:(?:cancel|delete)|cancelSubscription|deleteSubscription|deleteCustomer|stripe\.customers\.del|stripe\.subscriptions\.cancel)\b/i;
assert(!billingDeletionPatterns.test(accountPlugin + "\n" + billingCore),
  "billing cancellation/deletion must not be silently wired to identity privacy/account deletion");
assert(!/Delete account[\s\S]{0,240}(billingApi|openCustomerPortal|openSubscriptionModal|checkout|portal)/.test(accountPlugin),
  "Delete account copy must not be wired to billing actions");

for (const [label, source] of [
  ["Control Hub Account plugin", accountPlugin],
  ["Identity Core", identityCore],
  ["loader", loader],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
]) {
  assertNoPublicLeak(label, source);
}

console.log("  Privacy & Data section is present");
console.log("  export/delete/account deletion rows are deferred and inert");
console.log("  no account deletion, export bridge action, admin API, or service-role runtime was introduced");
console.log("  billing cancellation/deletion is not wired to identity deletion");
console.log("  UI/page/loader leak checks passed");
console.log("\nIdentity Phase 4.6 privacy/data lifecycle validation PASSED");
