// Identity Phase 3.4C/3.7A validation - session lifecycle UX boundary.
// Static only; no Supabase/network access.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const IDENTITY_SURFACE_CSS_REL = "surfaces/identity/identity.css";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function assertNoUiProviderLeak(label, source) {
  const checks = [
    ["Supabase SDK import", /@supabase\/supabase-js|@supabase\//i],
    ["provider bundle import/probe", /identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/],
    ["database table call", /\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships)['"`]/],
    ["RPC call", /\.rpc\s*\(/],
    ["service role", /\b(service_role|service-role|serviceRoleKey)\b/i],
    ["access token field", /\baccess_token\b/],
    ["refresh token field", /\brefresh_token\b/],
    ["raw session field", /\brawSession\b/],
    ["raw user field", /\brawUser\b/],
    ["unsafe DB owner/deleted field", /\bowner_user_id\b|\bdeleted_at\b/],
  ];
  for (const [name, pattern] of checks) {
    assert(!pattern.test(source), `${label}: ${name} must not appear in UI/page source`);
  }
}

console.log("\n-- Identity Phase 3.4C session UX validation --------------------");

const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const identitySurfaceCss = read(IDENTITY_SURFACE_CSS_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const loader = read(LOADER_REL);
const background = read(BACKGROUND_REL);
const docs = read(DOC_REL);

for (const [label, source] of [
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["identity surface CSS", identitySurfaceCss],
  ["loader", loader],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoUiProviderLeak(label, source);
}

assert(identitySurfaceHtml.includes("You stay signed in") && identitySurfaceHtml.includes("until you sign out or your session is revoked"),
  "identity surface must explain persistent provider sign-in UX");
assert(identitySurfaceJs.includes("You stay signed in on this browser until you sign out or your session is revoked"),
  "identity surface ready copy must explain persistent provider sign-in UX");
assert(controlHubAccountSurface.includes("Provider sessions and tokens stay background-owned."),
  "Control Hub Account tab must describe background-owned provider policy");
assert(controlHubAccountSurface.includes("You stay signed in on this browser until you sign out or your session is revoked"),
  "Control Hub synced help must mention persistent provider sign-in UX");

assert(!/keep me signed in/i.test(identitySurfaceHtml + identitySurfaceJs + controlHubAccountSurface + loader),
  "UI must not add keep-me-signed-in checkbox or behavior");
assert(!/h2oIdentityProviderPersistentRefreshV1|persistentRefresh|rememberDevice|remember-device|\brefresh_token\b/i.test(identitySurfaceHtml + identitySurfaceJs + controlHubAccountSurface + loader),
  "UI/page/loader must not mention persistent provider refresh-token internals");
assert(!/chrome\.storage\.local[^;\n]*(h2oIdentityProviderSessionV1|access_token)/.test(background),
  "background must not persist active provider session or access token in chrome.storage.local");
assert(background.includes('const IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY = "h2oIdentityProviderPersistentRefreshV1"'),
  "background must define the approved persistent refresh key for Phase 3.7A");
assert(identitySurfaceJs.includes("refs.otpCode.value = ''"),
  "OTP code must remain transient and clear after verify");
assert(!/localStorage|sessionStorage/.test(identitySurfaceJs),
  "identity surface must not store UI, OTP, or provider state in page storage");

assert(docs.includes("## 15.13 Phase 3.4C - Session Lifecycle UX Decision"),
  "identity docs must include the Phase 3.4C decision note");
assert(docs.includes("Phase 3.4C chooses the session-only model"),
  "identity docs must retain the historical session-only decision");
assert(docs.includes("chrome.storage.session[h2oIdentityProviderSessionV1]"),
  "identity docs must keep raw provider session scoped to chrome.storage.session");
assert(docs.includes("## 15.19 Phase 3.7A - Persistent Sign-In Implementation"),
  "identity docs must include the Phase 3.7A persistent sign-in implementation note");
assert(docs.includes("h2oIdentityProviderPersistentRefreshV1") && docs.includes("refresh token only"),
  "identity docs must document refresh-token-only persistence");
assert(docs.includes("no \"keep me signed in\" checkbox"),
  "identity docs must document that no keep-me-signed-in checkbox is added");

console.log("  persistent sign-in UX copy present");
console.log("  persistent refresh internals remain out of UI/page/loader");
console.log("  UI/page token and Supabase boundaries preserved");
console.log("\nIdentity Phase 3.4C/3.7A session UX validation PASSED");
