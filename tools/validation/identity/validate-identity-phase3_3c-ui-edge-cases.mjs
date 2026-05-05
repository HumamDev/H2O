// Identity Phase 3.3C validation — UI edge cases and failure-path safety.
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

const SENSITIVE_TERMS = [
  "access_token",
  "refresh_token",
  "rawsession",
  "raw user",
  "rawuser",
  "owner_user_id",
  "deleted_at",
  "service_role",
  "service-role",
  "servicerolekey",
];

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

function initialBridgeState(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function readyProviderConfig(providerBacked) {
  return providerBacked
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
}

function safeProfileWorkspace(req = {}) {
  const profile = {
    id: "profile-c33d8a7f",
    displayName: req.displayName || "Humam",
    avatarColor: req.avatarColor || "violet",
    onboardingCompleted: true,
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
  };
  const workspace = {
    id: "workspace-6f0704a2",
    name: req.workspaceName || "Humam Workspace",
    role: "owner",
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
  };
  return { profile, workspace };
}

function makeGlobal({
  providerBacked = true,
  failures = {},
  bridgeState: bridgeStateInput = null,
} = {}) {
  const storage = {};
  const listeners = {};
  const MSG_REQ = "h2o-ext-identity:v1:req";
  const MSG_RES = "h2o-ext-identity:v1:res";
  let bridgeState = bridgeStateInput
    ? initialBridgeState(bridgeStateInput)
    : initialBridgeState();
  const providerConfigStatus = readyProviderConfig(providerBacked);
  let completeOnboardingCalls = 0;
  let signOutCalls = 0;
  let refreshCalls = 0;

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
      } else if (action === "identity:request-email-otp" && providerBacked) {
        response = maybeFailure(failures.request || failures[action]);
        if (!response) {
          bridgeState = {
            ...bridgeState,
            status: "email_pending",
            mode: "provider_backed",
            provider: "supabase",
            providerKind: "supabase",
            emailVerified: false,
            emailMasked: null,
            pendingEmailMasked: "ha***@example.invalid",
            updatedAt: new Date().toISOString(),
          };
          response = { ok: true, nextStatus: "email_pending", emailMasked: "ha***@example.invalid", pendingEmailMasked: "ha***@example.invalid" };
        }
      } else if (action === "identity:verify-email-otp" && providerBacked) {
        response = maybeFailure(failures.verify || failures[action]);
        if (!response) {
          bridgeState = {
            ...bridgeState,
            status: "verified_no_profile",
            mode: "provider_backed",
            provider: "supabase",
            providerKind: "supabase",
            credentialState: "complete",
            emailVerified: true,
            emailMasked: "ha***@example.invalid",
            pendingEmailMasked: "ha***@example.invalid",
            userIdMasked: "c33d8a***2049",
            sessionExpiresAt: "2026-05-01T12:00:00.000Z",
            profile: null,
            workspace: null,
            onboardingCompleted: false,
            syncReady: false,
            updatedAt: new Date().toISOString(),
          };
          response = { ok: true, nextStatus: "verified_no_profile", credentialState: "complete", emailMasked: "ha***@example.invalid", pendingEmailMasked: "ha***@example.invalid", userIdMasked: "c33d8a***2049", emailVerified: true };
        }
      } else if (action === "identity:complete-onboarding" && providerBacked) {
        response = maybeFailure(failures.complete || failures[action]);
        if (!response) {
          completeOnboardingCalls += 1;
          const { profile, workspace } = safeProfileWorkspace(data.req);
          bridgeState = {
            ...bridgeState,
            status: "sync_ready",
            mode: "provider_backed",
            provider: "supabase",
            providerKind: "supabase",
            credentialState: "complete",
            emailVerified: true,
            onboardingCompleted: true,
            syncReady: true,
            profile,
            workspace,
            updatedAt: new Date().toISOString(),
          };
          response = { ok: true, nextStatus: "sync_ready", credentialState: "complete", profile, workspace };
        }
      } else if (action === "identity:refresh-session") {
        refreshCalls += 1;
        response = { ok: true, nextStatus: bridgeState.status };
      } else if (action === "identity:sign-out") {
        signOutCalls += 1;
        bridgeState = initialBridgeState();
        response = { ok: true, nextStatus: "anonymous_local" };
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
    __h2oHarness: {
      getBridgeState: () => bridgeState,
      getCompleteOnboardingCalls: () => completeOnboardingCalls,
      getSignOutCalls: () => signOutCalls,
      getRefreshCalls: () => refreshCalls,
      storage,
    },
  };
  return { g, storage };
}

function maybeFailure(code) {
  if (!code) return null;
  return {
    ok: false,
    nextStatus: "auth_error",
    errorCode: code,
    errorMessage: "raw provider detail should not surface",
    access_token: "forbidden",
    refresh_token: "forbidden",
  };
}

function bootIdentity(globalObject) {
  const source = read(IDENTITY_CORE_REL);
  const fn = new Function("unsafeWindow", source + "\n//# sourceURL=identity-core-phase33c-validator.js");
  fn.call(globalObject, globalObject);
  return globalObject.H2O.Identity;
}

async function flush(ms = 20) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPublicStateClean(label, api, storage, extraForbidden = []) {
  const payload = JSON.stringify({
    localStorage: storage,
    snapshot: api.getSnapshot(),
    diag: api.diag(),
  }).toLowerCase();
  for (const term of [...SENSITIVE_TERMS, ...extraForbidden.map((value) => String(value).toLowerCase())]) {
    assert(!payload.includes(term), `${label}: public state/storage must not contain ${term}`);
  }
}

async function validateVerifyFailure(code, expectedMessage, submittedCode) {
  const { g, storage } = makeGlobal({ providerBacked: true, failures: { verify: code } });
  const api = bootIdentity(g);
  await flush();
  let snap = await api.signInWithEmail("humam@example.invalid");
  assert(snap.status === "email_pending", `${code}: setup must reach email_pending`);
  snap = await api.verifyEmailCode({ code: submittedCode });
  assert(snap.status === "auth_error", `${code}: verify failure must return auth_error`);
  assert(snap.lastError?.code === code, `${code}: safe error code must be preserved`);
  assert(snap.lastError?.message === expectedMessage, `${code}: safe error text must be mapped`);
  assert(!snap.profile && !snap.workspace, `${code}: failure must not create profile/workspace`);
  assertPublicStateClean(code, api, storage, [submittedCode, "raw provider detail"]);
}

async function validateRequestFailure(code, expectedMessage) {
  const { g, storage } = makeGlobal({ providerBacked: true, failures: { request: code } });
  const api = bootIdentity(g);
  await flush();
  const snap = await api.signInWithEmail("humam@example.invalid");
  assert(snap.status === "auth_error", `${code}: request failure must return auth_error`);
  assert(snap.lastError?.code === code, `${code}: safe error code must be preserved`);
  assert(snap.lastError?.message === expectedMessage, `${code}: safe error text must be mapped`);
  assert(!snap.profile && !snap.workspace, `${code}: failure must not create local mock profile/workspace`);
  assertPublicStateClean(code, api, storage, ["humam@example.invalid", "raw provider detail"]);
}

async function validateRepeatOnboardingIdempotent() {
  const { g, storage } = makeGlobal({ providerBacked: true });
  const api = bootIdentity(g);
  await flush();
  await api.signInWithEmail("humam@example.invalid");
  await api.verifyEmailCode({ code: "12345678" });
  const first = await api.createInitialWorkspace({ displayName: "Humam", avatarColor: "violet", workspaceName: "Humam Workspace" });
  const second = await api.createInitialWorkspace({ displayName: "Humam", avatarColor: "violet", workspaceName: "Humam Workspace" });
  assert(first.status === "sync_ready" && second.status === "sync_ready", "repeat onboarding must stay sync_ready");
  assert(first.profile?.id === second.profile?.id, "repeat onboarding must keep same profile id in safe summary");
  assert(first.workspace?.id === second.workspace?.id, "repeat onboarding must keep same workspace id in safe summary");
  assert(g.__h2oHarness.getCompleteOnboardingCalls() === 1, "repeat onboarding after sync_ready must not send another complete-onboarding write");
  assertPublicStateClean("repeat onboarding", api, storage, ["12345678", "humam@example.invalid"]);
}

async function validateSyncReadyCreateInitialWorkspaceNoop() {
  const restored = safeSyncReadyState();
  const { g, storage } = makeGlobal({
    providerBacked: true,
    bridgeState: restored,
  });
  const api = bootIdentity(g);
  await flush(40);
  const snap = await api.createInitialWorkspace({
    displayName: "Changed Name",
    avatarColor: "amber",
    workspaceName: "Changed Workspace",
  });
  assert(snap.status === "sync_ready", "sync_ready no-op must remain sync_ready");
  assert(snap.mode === "provider_backed", "sync_ready no-op must preserve provider-backed mode");
  assert(snap.profile?.id === restored.profile.id, "sync_ready no-op must keep existing profile id");
  assert(snap.workspace?.id === restored.workspace.id, "sync_ready no-op must keep existing workspace id");
  assert(g.__h2oHarness.getCompleteOnboardingCalls() === 0, "sync_ready profile/workspace restore must not call complete-onboarding bridge");
  assertPublicStateClean("sync_ready onboarding no-op", api, storage, ["Changed Name", "Changed Workspace"]);
}

async function validateSignOutReset() {
  const { g, storage } = makeGlobal({
    providerBacked: true,
    bridgeState: {
      ...safeSyncReadyState(),
    },
  });
  const api = bootIdentity(g);
  await flush();
  let snap = api.getSnapshot();
  assert(snap.status === "sync_ready", "sign-out setup must hydrate sync_ready from bridge");
  snap = await api.signOut();
  assert(snap.status === "anonymous_local", "sign-out must reset to anonymous_local");
  assert(snap.mode === "local_dev", "sign-out must reset mode to local_dev");
  assert(!snap.profile && !snap.workspace, "sign-out must clear public profile/workspace");
  assert(g.__h2oHarness.getSignOutCalls() === 1, "sign-out must call existing identity:sign-out bridge action");
  assertPublicStateClean("sign-out", api, storage);
}

async function validateRefreshKeepsSyncReady() {
  const { g, storage } = makeGlobal({
    providerBacked: true,
    bridgeState: safeSyncReadyState(),
  });
  const api = bootIdentity(g);
  await flush();
  const snap = await api.refreshSession();
  assert(snap.status === "sync_ready", "refresh must keep latest sync_ready provider state");
  assert(snap.mode === "provider_backed", "refresh must preserve provider-backed mode");
  assert(g.__h2oHarness.getRefreshCalls() === 0, "refresh should pull bridge snapshot before local fallback bridge refresh");
  assertPublicStateClean("refresh", api, storage);
}

async function validateWakeHydratesProviderState() {
  const { g, storage } = makeGlobal({
    providerBacked: true,
    bridgeState: safeSyncReadyState(),
  });
  const api = bootIdentity(g);
  await flush(40);
  const snap = api.getSnapshot();
  assert(snap.status === "sync_ready", "wake hydration must apply non-anonymous bridge state");
  assert(snap.mode === "provider_backed", "wake hydration must preserve provider-backed mode");
  assert(snap.profile?.displayName === "Humam", "wake hydration must keep safe profile summary");
  assertPublicStateClean("wake hydration", api, storage);
}

async function validateLocalOnlyFallback() {
  const { g, storage } = makeGlobal({ providerBacked: false });
  const api = bootIdentity(g);
  await flush();
  const snap = await api.enterLocalMode({ displayName: "Local User", workspaceName: "Local Workspace" });
  assert(snap.status === "profile_ready", "local-only setup must create profile_ready");
  assert(snap.mode === "local_dev", "local-only setup must stay local_dev");
  assert(snap.provider === "mock_local", "local-only setup must stay mock_local");
  assert(snap.status !== "sync_ready", "local-only setup must not look provider synced");
  assertPublicStateClean("local-only fallback", api, storage);
}

function safeSyncReadyState() {
  const { profile, workspace } = safeProfileWorkspace();
  return {
    status: "sync_ready",
    mode: "provider_backed",
    provider: "supabase",
    providerKind: "supabase",
    credentialState: "complete",
    emailVerified: true,
    emailMasked: "ha***@example.invalid",
    pendingEmailMasked: null,
    userIdMasked: "c33d8a***2049",
    sessionExpiresAt: "2026-05-01T12:00:00.000Z",
    profile,
    workspace,
    onboardingCompleted: true,
    syncReady: true,
    updatedAt: new Date().toISOString(),
  };
}

console.log("\n── Identity Phase 3.3C UI edge-case validation ───────────────────");

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

assert(identitySurfaceJs.includes("refs.otpCode.value = ''"), "OTP input must clear after verify success/failure");
assert(identitySurfaceJs.includes("setButtonState(refs.send, 'send'"), "send button must have disabled/busy state");
assert(identitySurfaceJs.includes("setButtonState(refs.verify, 'verify'"), "verify button must have disabled/busy state");
assert(identitySurfaceJs.includes("setButtonState(refs.complete, 'complete'"), "complete button must have disabled/busy state");
assert(identitySurfaceJs.includes("setButtonState(refs.reset, 'reset'"), "sign-out/reset button must have disabled/busy state");
assert(controlHubAccountSurface.includes("Account ready / synced"), "Account tab must show synced account label");
assert(controlHubAccountSurface.includes("Account profile and workspace are synced. You stay signed in on this browser until you sign out or your session is revoked."), "Account tab must show provider-aware synced state help");
assert(!/Real authentication is not implemented/i.test(identitySurfaceHtml + identitySurfaceJs + controlHubAccountSurface),
  "UI must not show stale real-auth-not-implemented copy");

for (const [code, message] of [
  ["identity/otp-invalid", "That code did not match. Try again."],
  ["identity/otp-expired", "That code expired. Request a new one."],
  ["identity/provider-rate-limited", "Too many email requests. Wait a bit before trying again."],
  ["identity/permission-not-ready", "Provider permission is not granted. Use the Dev Controls popup to grant it."],
  ["identity/network-not-ready", "Provider network is not ready. Check permission and config."],
  ["identity/onboarding-session-missing", "Your verified session is missing. Sign in again."],
]) {
  assert(identityCore.includes(`'${code}'`), `Identity Core must map ${code}`);
  assert(identityCore.includes(message), `Identity Core must expose safe text for ${code}`);
  assert(identitySurfaceJs.includes(`'${code}'`), `identity UI must map ${code}`);
  assert(identitySurfaceJs.includes(message), `identity UI must expose safe text for ${code}`);
}

await validateVerifyFailure("identity/otp-invalid", "That code did not match. Try again.", "11111111");
console.log("  wrong OTP safe failure ✓");
await validateVerifyFailure("identity/otp-expired", "That code expired. Request a new one.", "22222222");
console.log("  expired OTP safe failure ✓");
await validateRequestFailure("identity/provider-rate-limited", "Too many email requests. Wait a bit before trying again.");
console.log("  provider rate-limit safe failure ✓");
await validateRequestFailure("identity/permission-not-ready", "Provider permission is not granted. Use the Dev Controls popup to grant it.");
console.log("  missing permission safe failure ✓");
await validateRequestFailure("identity/network-not-ready", "Provider network is not ready. Check permission and config.");
console.log("  network-not-ready safe failure ✓");
await validateRepeatOnboardingIdempotent();
console.log("  repeat onboarding avoids unnecessary write after sync_ready ✓");
await validateSyncReadyCreateInitialWorkspaceNoop();
console.log("  restored sync_ready createInitialWorkspace is a safe no-op ✓");
await validateSignOutReset();
console.log("  sign-out resets public state safely ✓");
await validateRefreshKeepsSyncReady();
console.log("  refresh pulls latest sync_ready state ✓");
await validateWakeHydratesProviderState();
console.log("  wake hydration preserves safe provider-backed state ✓");
await validateLocalOnlyFallback();
console.log("  local-only fallback remains visually/local-state clear ✓");

console.log("\nIdentity Phase 3.3C UI edge-case validation PASSED ✓");
