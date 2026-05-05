// Identity Phase 3.3A validation — onboarding UI and Account tab state alignment.
// This validator is static + simulated only; it does not contact Supabase.

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
    ["provider bundle reference", /identity-provider-supabase|H2O_IDENTITY_PROVIDER_BUNDLE_PROBE/],
    ["database table call", /\.from\s*\(\s*['"`](profiles|workspaces|workspace_memberships)['"`]/],
    ["RPC call", /\.rpc\s*\(/],
    ["service role", /\b(service_role|service-role|serviceRoleKey)\b/i],
    ["access token field", /\baccess_token\b/],
    ["refresh token field", /\brefresh_token\b/],
    ["raw session field", /\brawSession\b|\bsession\s*:/],
    ["raw user field", /\brawUser\b/],
    ["unsafe DB owner field", /\bowner_user_id\b|\bdeleted_at\b/],
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
        if (providerFailure) response = { ok: false, nextStatus: "auth_error", errorCode: providerFailure, errorMessage: "Provider readiness is incomplete." };
        else {
          bridgeState = {
            ...bridgeState,
            status: "email_pending",
            mode: "provider_backed",
            provider: "supabase",
            providerKind: "supabase",
            emailMasked: null,
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
  const fn = new Function("unsafeWindow", source + "\n//# sourceURL=identity-core-phase33a-validator.js");
  fn.call(globalObject, globalObject);
  return globalObject.H2O.Identity;
}

async function flush(ms = 20) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateProviderSimulation() {
  const { g, storage } = makeGlobal({ providerBacked: true });
  const api = bootIdentity(g);
  await flush();
  let snap = await api.signInWithEmail("humam@example.invalid");
  assert(snap.status === "email_pending", `provider simulation: expected email_pending, got ${snap.status}`);
  assert(snap.mode === "provider_backed", "provider simulation: sign-in state must be provider_backed");
  assert(snap.pendingEmail === null, "provider simulation: raw pending email must not be stored in snapshot");
  assert(snap.pendingEmailMasked === "ha***@example.invalid", "provider simulation: pending email must be masked");

  snap = await api.verifyEmailCode({ code: "12345678" });
  assert(snap.status === "verified_no_profile", `provider simulation: expected verified_no_profile, got ${snap.status}`);
  assert(snap.emailVerified === true, "provider simulation: emailVerified must be true");

  snap = await api.createInitialWorkspace({ displayName: "Humam", avatarColor: "violet", workspaceName: "Humam Workspace" });
  assert(snap.status === "sync_ready", `provider simulation: expected sync_ready, got ${snap.status}`);
  assert(snap.profile?.displayName === "Humam", "provider simulation: safe profile summary must be applied");
  assert(snap.workspace?.name === "Humam Workspace", "provider simulation: safe workspace summary must be applied");
  const stored = JSON.stringify(storage).toLowerCase();
  for (const forbidden of ["12345678", "humam@example.invalid", "access_token", "refresh_token", "rawsession", "owner_user_id", "deleted_at"]) {
    assert(!stored.includes(forbidden), `provider simulation: localStorage must not contain ${forbidden}`);
  }
}

async function validateProviderFailureSimulation() {
  const { g } = makeGlobal({ providerBacked: true, providerFailure: "identity/permission-not-ready" });
  const api = bootIdentity(g);
  await flush();
  const snap = await api.signInWithEmail("humam@example.invalid");
  assert(snap.status === "auth_error", `provider failure simulation: expected auth_error, got ${snap.status}`);
  assert(snap.lastError?.code === "identity/permission-not-ready",
    "provider failure simulation: safe provider readiness error must be preserved");
  assert(!snap.profile && !snap.workspace,
    "provider failure simulation: incomplete provider readiness must not create mock profile/workspace");
}

async function validateLocalFallbackSimulation() {
  const { g } = makeGlobal({ providerBacked: false });
  const api = bootIdentity(g);
  await flush();
  let snap = await api.signInWithEmail("local@example.invalid");
  assert(snap.status === "email_pending", "local fallback: sign-in must still enter email_pending");
  snap = await api.verifyEmailCode({ code: "local-code" });
  assert(snap.status === "verified_no_profile", "local fallback: verify must still enter verified_no_profile");
  snap = await api.createInitialWorkspace({ displayName: "Local User", workspaceName: "Local Workspace" });
  assert(snap.status === "profile_ready", "local fallback: onboarding must still create a local profile");
}

console.log("\n── Identity Phase 3.3A UI validation ─────────────────────────────");

const identityCore = read(IDENTITY_CORE_REL);
const identitySurfaceJs = read(IDENTITY_SURFACE_JS_REL);
const identitySurfaceHtml = read(IDENTITY_SURFACE_HTML_REL);
const identitySurfaceCss = read(IDENTITY_SURFACE_CSS_REL);
const controlHub = read(CONTROL_HUB_REL);
const controlHubAccount = read(CONTROL_HUB_ACCOUNT_REL);
const controlHubAccountSurface = `${controlHub}\n${controlHubAccount}`;
const loader = read(LOADER_REL);

assert(identityCore.includes("async function getBridgeProviderStatus()"),
  "Identity Core must decide provider mode through background derived state");
assert(identityCore.includes("providerConfigStatus"),
  "Identity Core provider decision must inspect providerConfigStatus");
assert(identityCore.includes("sendBridgeRaw('identity:request-email-otp'"),
  "Identity Core provider sign-in must await request-email-OTP bridge response");
assert(identityCore.includes("sendBridgeRaw('identity:verify-email-otp', { code })"),
  "Identity Core provider verify must send only the temporary OTP code");
assert(identityCore.includes("sendBridgeRaw('identity:complete-onboarding', onboardingInput)"),
  "Identity Core provider onboarding must use the existing complete-onboarding bridge action");
assert(identityCore.includes("normalizeProviderOnboardingInput"),
  "Identity Core must validate provider onboarding input before bridge submit");
assert(identityCore.includes("applyProviderBridgeState"),
  "Identity Core must hydrate provider actions from sanitized background state");
assert(identitySurfaceHtml.includes("h2oi-otp-code") && identitySurfaceJs.includes("refs.otpCode.value = ''"),
  "Onboarding UI must collect temporary OTP code and clear it after verification");
assert(identitySurfaceHtml.includes("h2oi-avatar-color") && identitySurfaceHtml.includes('value="violet"'),
  "Onboarding UI must collect avatar color slug with violet default");
assert(controlHubAccountSurface.includes("Provider sessions and tokens stay background-owned."),
  "Control Hub Account tab must describe provider session boundary");
assert(controlHubAccountSurface.includes("Account ready / synced"),
  "Control Hub Account tab must label sync_ready provider state");

assertNoUiProviderLeak("identity surface JS", identitySurfaceJs);
assertNoUiProviderLeak("identity surface HTML", identitySurfaceHtml);
assertNoUiProviderLeak("identity surface CSS", identitySurfaceCss);
assertNoUiProviderLeak("loader", loader);
assertNoUiProviderLeak("Control Hub Account plugin", controlHubAccount);

await validateProviderSimulation();
console.log("  provider-backed UI facade simulation ✓");
await validateProviderFailureSimulation();
console.log("  provider readiness failure stays safely blocked ✓");
await validateLocalFallbackSimulation();
console.log("  local/mock fallback remains working ✓");

console.log("\nIdentity Phase 3.3A UI validation PASSED ✓");
