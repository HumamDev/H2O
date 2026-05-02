// Identity Phase 3.5A/3.7A validation - persistent sign-in architecture and approved implementation.
// Static only; no Supabase/network access.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DOC_REL = "docs/identity/IDENTITY_PHASE_3_0_SUPABASE_PREP.md";
const BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const IDENTITY_SURFACE_CSS_REL = "surfaces/identity/identity.css";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";

const PERSISTENT_KEY = "h2oIdentityProviderPersistentRefreshV1";

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function extractSection(source, heading, nextHeadingPattern) {
  const start = source.indexOf(heading);
  if (start < 0) return "";
  const rest = source.slice(start);
  const next = rest.search(nextHeadingPattern);
  return next > 0 ? rest.slice(0, next) : rest;
}

function extractFirstJsBlock(source) {
  const match = source.match(/```js\n([\s\S]*?)\n```/);
  return match ? match[1] : "";
}

function assertNoPagePersistentInternals(label, source) {
  assert(!source.includes(PERSISTENT_KEY),
    `${label}: persistent refresh-token key must remain background-only`);
  assert(!/keep me signed in/i.test(source),
    `${label}: keep-me-signed-in UI or behavior must not be introduced`);
  assert(!/rememberDevice|remember-device|persistentRefresh|\brefresh_token\b|\baccess_token\b/i.test(source),
    `${label}: persistent refresh internals and token fields must not appear`);
}

console.log("\n-- Identity Phase 3.5A persistence review validation ------------");

const docs = read(DOC_REL);
const phase35a = extractSection(docs, "## 15.15 Phase 3.5A - Persistent Sign-In Architecture Review", /\n## 16\./);
const background = read(BACKGROUND_REL);
const loader = read(LOADER_REL);
const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const identitySurfaceCss = read(IDENTITY_SURFACE_CSS_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);

assert(phase35a,
  "docs must include Phase 3.5A persistent sign-in architecture review section");
assert(phase35a.includes("architecture and security review only"),
  "3.5A docs must state this is review only");
assert(phase35a.includes("does not implement persistence"),
  "3.5A docs must state persistence is not implemented");
assert(phase35a.includes("does not store refresh tokens"),
  "3.5A docs must state refresh tokens are not stored in this phase");
assert(phase35a.includes("Decision: keep the current session-only model unless product UX explicitly requires persistent sign-in"),
  "3.5A docs must record the original review decision");
assert(phase35a.includes("superseded by Phase 3.7A approval"),
  "3.5A docs must note that 3.7A explicitly approved default-on persistent sign-in");
assert(phase35a.includes("must persist only a refresh token"),
  "3.5A docs must restrict future persistence to refresh token only");
assert(phase35a.includes("Access tokens") && phase35a.includes("must never be persisted"),
  "3.5A docs must forbid access token persistence");
assert(phase35a.includes("chrome.storage.local") && phase35a.includes("not OS keychain-grade encrypted storage"),
  "3.5A docs must capture the chrome.storage.local threat model");

const schemaBlock = extractFirstJsBlock(phase35a);
assert(schemaBlock.includes(PERSISTENT_KEY),
  "3.5A docs must document the future persistent refresh key");
for (const field of ["version", "provider", "providerKind", "projectOrigin", "refresh_token", "createdAt", "updatedAt", "lastRotatedAt"]) {
  assert(schemaBlock.includes(field), `3.5A future schema must include ${field}`);
}
assert(!/\baccess_token\b|\brawSession\b|\bsession\s*:|\buser\s*:|\bemail\s*:|\bpublicClient\b|\bservice/i.test(schemaBlock),
  "3.5A future schema must not include access token, raw session, raw user/email/config, or service fields");

assert(phase35a.includes("Prefer the current `chrome.storage.session[h2oIdentityProviderSessionV1]` path"),
  "startup restore must prefer the current session storage path");
assert(phase35a.includes("provider refresh helper"),
  "startup restore must use the existing provider refresh helper");
assert(phase35a.includes("Store the returned full raw session only in `chrome.storage.session`"),
  "startup restore must keep active raw session in chrome.storage.session only");
assert(phase35a.includes("Replace `h2oIdentityProviderPersistentRefreshV1` with the rotated refresh token"),
  "refresh-token rotation must be documented");
assert(phase35a.includes("load_identity_state"),
  "startup restore must document read-only cloud identity restore");
assert(phase35a.includes("Sign-out") && phase35a.includes("h2oIdentityProviderPersistentRefreshV1"),
  "sign-out must document clearing the future persistent key");
assert(phase35a.includes("3.7A removes the opt-in checkbox proposal and keeps persistent sign-in default-on only for real provider-backed Supabase identity"),
  "3.5A docs must record the approved 3.7A default-on policy");
assert(phase35a.includes("Future validator gates before implementation"),
  "3.5A docs must include future validator gates");
assert(phase35a.includes("Manual test plan for a future implementation"),
  "3.5A docs must include future manual tests");
assert(phase35a.includes("tools/validation/identity/validate-identity-phase3_5a-persistence-review.mjs"),
  "3.5A docs must mention this static review validator");
assert(phase35a.includes("node tools/validation/identity/validate-identity-phase3_5a-persistence-review.mjs"),
  "3.5A docs must include this validator command");

for (const [label, source] of [
  ["loader", loader],
  ["Identity Core", identityCore],
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["identity surface CSS", identitySurfaceCss],
  ["Control Hub", controlHub],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoPagePersistentInternals(label, source);
}

assert(background.includes(`const IDENTITY_PROVIDER_PERSISTENT_REFRESH_KEY = "${PERSISTENT_KEY}"`),
  "background must define the approved persistent refresh key");
assert(background.includes("providerPersistentRefreshStorageStrict") &&
  background.includes("providerPersistentRefreshSet") &&
  background.includes("providerPersistentRefreshGet") &&
  background.includes("providerPersistentRefreshRemove"),
  "background must own explicit persistent refresh storage helpers");
assert(!/chrome\.storage\.local[^\n;]*(access_token|h2oIdentityProviderSessionV1)/i.test(background),
  "background must not persist access token or full active session in chrome.storage.local");

assert(!/@supabase\/supabase-js|@supabase\//i.test(identitySurfaceJs + identitySurfaceHtml + loader),
  "UI/page/loader must not import Supabase SDK");
assert(!/\.rpc\s*\(/.test(identitySurfaceJs + identitySurfaceHtml + loader),
  "UI/page/loader must not call Supabase rpc");
assert(!/\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships)['"`]/.test(identitySurfaceJs + identitySurfaceHtml + loader),
  "UI/page/loader must not call Supabase identity tables");
assert(!/service_role|service-role|serviceRoleKey/i.test(identitySurfaceJs + identitySurfaceHtml + loader),
  "UI/page/loader must not expose service-role strings");

console.log("  Phase 3.5A architecture decision and 3.7A approval documented");
console.log("  refresh-token-only schema documented");
console.log("  persistent refresh storage remains background-only");
console.log("  page/UI/loader provider boundaries remain enforced");
console.log("\nIdentity Phase 3.5A/3.7A persistence validation PASSED");
