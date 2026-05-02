// Identity Phase 3.3B validation — UI polish, safe errors, and cleanup.
// Static + simulated only; no Supabase/network access.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const IDENTITY_CORE_REL = "scripts/0D4a.⬛️🔐 Identity Core 🔐.js";
const IDENTITY_SURFACE_JS_REL = "surfaces/identity/identity.js";
const IDENTITY_SURFACE_HTML_REL = "surfaces/identity/identity.html";
const IDENTITY_SURFACE_CSS_REL = "surfaces/identity/identity.css";
const CONTROL_HUB_REL = "scripts/0Z1a.⬛️🕹️ Control Hub 🕹️.js";
const CONTROL_HUB_ACCOUNT_REL = "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js";
const LOADER_REL = "tools/product/extension/chrome-live-loader.mjs";

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
    ["raw session field", /\brawSession\b|\bsession\s*:/],
    ["raw user field", /\brawUser\b/],
    ["unsafe DB owner/deleted field", /\bowner_user_id\b|\bdeleted_at\b/],
  ];
  for (const [name, pattern] of checks) {
    assert(!pattern.test(source), `${label}: ${name} must not appear in UI/page source`);
  }
}

function makeGlobal({ providerBacked = true, providerFailure = null } = {}) {
  const storage = {};
  const listeners = {};
  const MSG_REQ = "h2o-ext-identity:v1:req";
  const MSG_RES = "h2o-ext-identity:v1:res";
  let bridgeState = {
    status: "anonymous_local",
    mode: "local_dev",
    provider: "mock_local",
    providerKind: "none",
    emailVerified: false,
    emailMasked: null,
    pendingEmailMasked: null,
    onboardingCompleted: false,
    syncReady: false,
    profile: null,
    workspace: null,
    updatedAt: new Date().toISOString(),
  };
  const providerConfigStatus = providerBacked
    ? {
        providerKind: "supabase",
        providerMode: "provider_backed",
        providerConfigured: true,
        valid: true,
        clientReady: true,
        permissionReady: true,
        phaseNetworkEnabled: true,
        networkReady: true,
      }
    : {
        providerKind: "mock",
        providerMode: "local_dev",
        providerConfigured: true,
        valid: true,
        clientReady: false,
        permissionReady: false,
        phaseNetworkEnabled: false,
        networkReady: false,
      };
  const g = {
    H2O: undefined,
    location: { protocol: "https:" },
    console,
    Date,
    JSON,
    Object,
    Array,
    Math,
    Promise,
    Error,
    Set,
    Map,
    structuredClone: (value) => JSON.parse(JSON.stringify(value)),
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    localStorage: {
      getItem: (key) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
      setItem: (key, value) => { storage[key] = String(value); },
      removeItem: (key) => { delete storage[key]; },
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((entry) => entry !== fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners[event.type] || []) fn(event);
    },
    postMessage(data) {
      if (!data || data.type !== MSG_REQ || !data.id || !data.req) return;
      const action = String(data.req.action || "");
      let response = { ok: false, error: "unsupported" };
      if (action === "identity:get-derived-state") {
        response = { ok: true, derivedState: { ...bridgeState, providerConfigStatus } };
      } else if (action === "identity:get-snapshot") {
        response = { ok: true, snapshot: bridgeState.status === "anonymous_local" ? null : { ...bridgeState } };
      } else if (providerBacked && action === "identity:request-email-otp") {
        if (providerFailure) {
          response = { ok: false, nextStatus: "auth_error", errorCode: providerFailure, errorMessage: "raw provider detail should be ignored" };
        } else {
          bridgeState = {
            ...bridgeState,
            status: "email_pending",
            mode: "provider_backed",
            provider: "supabase",
            providerKind: "supabase",
            pendingEmailMasked: "ha***@example.invalid",
            updatedAt: new Date().toISOString(),
          };
          response = { ok: true, nextStatus: "email_pending", emailMasked: "ha***@example.invalid", pendingEmailMasked: "ha***@example.invalid" };
        }
      } else if (providerBacked && action === "identity:verify-email-otp") {
        bridgeState = {
          ...bridgeState,
          status: "verified_no_profile",
          credentialState: "complete",
          emailVerified: true,
          emailMasked: "ha***@example.invalid",
          pendingEmailMasked: "ha***@example.invalid",
          userIdMasked: "c33d8a***2049",
          sessionExpiresAt: "2026-05-01T12:00:00.000Z",
          updatedAt: new Date().toISOString(),
        };
        response = { ok: true, nextStatus: "verified_no_profile", credentialState: "complete", emailMasked: "ha***@example.invalid", pendingEmailMasked: "ha***@example.invalid", userIdMasked: "c33d8a***2049", emailVerified: true };
      } else if (providerBacked && action === "identity:complete-onboarding") {
        bridgeState = {
          ...bridgeState,
          status: "sync_ready",
          credentialState: "complete",
          onboardingCompleted: true,
          syncReady: true,
          profile: { id: "profile-id", displayName: data.req.displayName, avatarColor: data.req.avatarColor, onboardingCompleted: true, createdAt: "2026-05-01T12:00:00.000Z", updatedAt: "2026-05-01T12:00:00.000Z" },
          workspace: { id: "workspace-id", name: data.req.workspaceName, role: "owner", createdAt: "2026-05-01T12:00:00.000Z", updatedAt: "2026-05-01T12:00:00.000Z" },
          updatedAt: new Date().toISOString(),
        };
        response = { ok: true, nextStatus: "sync_ready", credentialState: "complete", profile: bridgeState.profile, workspace: bridgeState.workspace };
      }
      setTimeout(() => {
        g.dispatchEvent({
          type: "message",
          source: g,
          data: { type: MSG_RES, id: data.id, ...response },
        });
      }, 0);
    },
    setTimeout,
    clearTimeout,
  };
  return { g, storage };
}

function bootIdentity(globalObject) {
  const source = read(IDENTITY_CORE_REL);
  const fn = new Function("unsafeWindow", source + "\n//# sourceURL=identity-core-phase33b-validator.js");
  fn.call(globalObject, globalObject);
  return globalObject.H2O.Identity;
}

async function flush(ms = 20) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateProviderFailureMessage() {
  const { g, storage } = makeGlobal({ providerBacked: true, providerFailure: "identity/provider-rate-limited" });
  const api = bootIdentity(g);
  await flush();
  const snap = await api.signInWithEmail("humam@example.invalid");
  assert(snap.status === "auth_error", "provider failure must stay in auth_error");
  assert(snap.lastError?.code === "identity/provider-rate-limited", "provider rate-limit code must be preserved");
  assert(snap.lastError?.message === "Too many email requests. Wait a bit before trying again.",
    "provider rate-limit must map to safe user text");
  assert(!snap.profile && !snap.workspace, "provider failure must not create local profile/workspace");
  const stored = JSON.stringify(storage).toLowerCase();
  for (const forbidden of ["raw provider detail", "humam@example.invalid", "access_token", "refresh_token"]) {
    assert(!stored.includes(forbidden), `provider failure storage must not contain ${forbidden}`);
  }
}

async function validateProviderHappyPathNoOtpStorage() {
  const { g, storage } = makeGlobal({ providerBacked: true });
  const api = bootIdentity(g);
  await flush();
  await api.signInWithEmail("humam@example.invalid");
  await api.verifyEmailCode({ code: "87654321" });
  const snap = await api.createInitialWorkspace({ displayName: "Humam", avatarColor: "slate", workspaceName: "Humam Workspace" });
  assert(snap.status === "sync_ready", "provider happy path must still reach sync_ready");
  const stored = JSON.stringify(storage).toLowerCase();
  for (const forbidden of ["87654321", "humam@example.invalid", "access_token", "refresh_token", "rawsession", "owner_user_id", "deleted_at"]) {
    assert(!stored.includes(forbidden), `provider happy-path storage must not contain ${forbidden}`);
  }
}

async function validateLocalFallbackStillWorks() {
  const { g } = makeGlobal({ providerBacked: false });
  const api = bootIdentity(g);
  await flush();
  let snap = await api.signInWithEmail("local@example.invalid");
  assert(snap.status === "email_pending", "local fallback sign-in must still reach email_pending");
  snap = await api.verifyEmailCode({ code: "local-code" });
  assert(snap.status === "verified_no_profile", "local fallback verify must still reach verified_no_profile");
  snap = await api.createInitialWorkspace({ displayName: "Local User", workspaceName: "Local Workspace" });
  assert(snap.status === "profile_ready", "local fallback onboarding must still reach profile_ready");
}

console.log("\n── Identity Phase 3.3B UI validation ─────────────────────────────");

const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const identitySurfaceCss = read(IDENTITY_SURFACE_CSS_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const loader = read(LOADER_REL);

for (const [label, source] of [
  ["identity surface JS", identitySurfaceJs],
  ["identity surface HTML", identitySurfaceHtml],
  ["identity surface CSS", identitySurfaceCss],
  ["loader", loader],
  ["Control Hub Account plugin", controlHubAccount],
]) {
  assertNoUiProviderLeak(label, source);
}

assert(!/Real authentication is not implemented/i.test(identitySurfaceHtml + identitySurfaceJs + controlHubAccountSurface),
  "provider-ready UI copy must not say real authentication is not implemented");
assert(identitySurfaceJs.includes("const ERROR_MESSAGES = Object.freeze"),
  "identity surface must map identity error codes to safe strings");
for (const code of [
  "identity/provider-rate-limited",
  "identity/invalid-otp-code",
  "identity/otp-invalid",
  "identity/otp-expired",
  "identity/permission-not-ready",
  "identity/network-not-ready",
  "identity/onboarding-invalid-input",
  "identity/onboarding-session-missing",
  "identity/onboarding-failed",
]) {
  assert(identitySurfaceJs.includes(code), `identity surface safe error map must include ${code}`);
  assert(identityCore.includes(code), `Identity Core safe bridge error map must include ${code}`);
}
assert(identitySurfaceJs.includes("let activeAction = null"), "identity surface must lock actions while one is in progress");
assert(identitySurfaceJs.includes("setButtonState(refs.send, 'send'"), "send OTP button must have busy/disabled state");
assert(identitySurfaceJs.includes("setButtonState(refs.verify, 'verify'"), "verify OTP button must have busy/disabled state");
assert(identitySurfaceJs.includes("setButtonState(refs.complete, 'complete'"), "complete onboarding button must have busy/disabled state");
assert(identitySurfaceJs.includes("setButtonState(refs.reset, 'reset'"), "sign-out/reset button must have busy/disabled state");
assert(identitySurfaceCss.includes(".h2oi-button:disabled"), "identity surface must style disabled buttons");
assert(identitySurfaceCss.includes('[aria-busy="true"]'), "identity surface must style busy panels");
assert(identitySurfaceJs.includes("refs.otpCode.value = ''"), "OTP code must be cleared after verification");
assert(!/localStorage|sessionStorage/.test(identitySurfaceJs), "identity surface must not write OTP or UI state to web storage");
assert(controlHubAccountSurface.includes("Signed out / local mode"), "Control Hub must use provider-aware anonymous label");
assert(controlHubAccountSurface.includes("Email code sent / waiting for verification"), "Control Hub must use provider-aware email_pending label");
assert(controlHubAccountSurface.includes("Account profile and workspace are synced. You stay signed in on this browser until you sign out or your session is revoked."), "Control Hub must describe synced provider session state");
assert(controlHubAccountSurface.includes("Provider sessions and tokens stay background-owned."), "Control Hub must describe provider token boundary");

await validateProviderFailureMessage();
console.log("  safe provider error mapping ✓");
await validateProviderHappyPathNoOtpStorage();
console.log("  provider path keeps OTP/token data out of localStorage ✓");
await validateLocalFallbackStillWorks();
console.log("  local/mock fallback remains working ✓");

console.log("\nIdentity Phase 3.3B UI validation PASSED ✓");
