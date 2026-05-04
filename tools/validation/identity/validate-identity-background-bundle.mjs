// Identity Phase 3.1A validation — conditional provider SDK bundle loading plus
// request-email-OTP-only provider boundary.
// Verifies the provider adapter lazy client smoke remains background-only and cannot
// leak provider code, provider config, credentials, tokens, or network behavior
// into page-facing extension outputs. Default mock/no-config builds must not load
// the provider SDK bundle at service-worker boot.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PROVIDER_BUNDLE_NAME = "identity-provider-supabase";
const PROVIDER_BUNDLE_REL = `provider/${PROVIDER_BUNDLE_NAME}.js`;
const PRIVATE_CONFIG_REL = "provider/identity-provider-private-config.js";
const PRIVATE_CONFIG_GLOBAL = "H2O_IDENTITY_PROVIDER_PRIVATE_CONFIG";
const LEGACY_PROVIDER_BUNDLE_NAME = ["identity", "provider", "dummy"].join("-");
const LEGACY_PROVIDER_BUNDLE_REL = `provider/${LEGACY_PROVIDER_BUNDLE_NAME}.js`;
const SOURCE_ENTRY_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const PROBE_MARKER = "H2O_IDENTITY_PROVIDER_BUNDLE_PROBE";
const SDK_PACKAGE_NAME = "@supabase/supabase-js";
const SDK_DIAG_PACKAGE = "provider-sdk";
const SDK_PROBE_KIND = "supabase-client-create-smoke";
const SDK_PROBE_PHASE = "3.0R";
const SMOKE_PROVIDER_URL = "https://h2o-provider-client-smoke.invalid";
const SMOKE_PUBLIC_CLIENT = "provider-client-smoke";
const REAL_CONFIG_SMOKE_PROVIDER_URL = "https://h2o-dev-config-readiness.invalid";
const REAL_CONFIG_SMOKE_PUBLIC_CLIENT = "phase3y-public-client";
const ADAPTER_PLANNED_OPS = ["requestEmailOtp", "verifyEmailOtp", "verifySignupEmailCode", "signUpWithPassword", "resendSignupConfirmation", "signInWithPassword", "requestPasswordReset", "updatePasswordAfterRecovery", "beginOAuthSignIn", "completeOAuthSignIn", "refreshProviderSession", "signOutProviderSession", "completeOnboarding", "loadIdentityState", "markPasswordSetupCompleted", "markOAuthCredentialCompleted"];
const VARIANTS = ["chrome-ext-dev-controls", "chrome-ext-dev-lean"];
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt"]);
const ALLOWED_MARKER_RELS = new Set(["bg.js", PROVIDER_BUNDLE_REL]);
const REDACTED_COMPLETE_DEV_ENV_STATUS = Object.freeze({
  schemaVersion: "3.0N",
  providerKind: "supabase",
  providerMode: "provider_backed",
  providerConfigured: true,
  configSource: "dev_env",
  valid: true,
  validationState: "valid",
  missingFields: [],
  errorCodes: [],
  capabilities: {
    emailOtp: true,
    magicLink: false,
    oauth: false,
  },
});

function toRel(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function readAbs(file) {
  return fs.readFileSync(file, "utf8");
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function existsAbs(file) {
  return fs.existsSync(file);
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "")) : [];
}

function listFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(file);
      } else if (entry.isFile()) {
        out.push(file);
      }
    }
  }
  return out.sort();
}

function textFiles(root) {
  return listFiles(root).filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

function flattenWarResources(manifest) {
  const entries = Array.isArray(manifest.web_accessible_resources)
    ? manifest.web_accessible_resources
    : [];
  return entries.flatMap((entry) => Array.isArray(entry.resources) ? entry.resources : []);
}

function assertNoPatterns(label, source, checks) {
  for (const [name, pattern] of checks) {
    assert(!pattern.test(source), `${label} contains forbidden ${name}: ${pattern}`);
  }
}

function assertOtpCodeNormalizer(label, source, functionName) {
  const index = source.indexOf(`function ${functionName}(input)`);
  assert(index >= 0, `${label}: ${functionName} helper missing`);
  const block = source.slice(index, index + 260);
  assert(block.includes('String(input || "").trim()'),
    `${label}: ${functionName} must trim caller OTP input`);
  const match = block.match(/return \/\^\[0-9\]\{(\d+),(\d+)\}\$\/\.test\(code\) \? code : "";/);
  assert(match, `${label}: ${functionName} must validate a bounded numeric OTP range`);
  const min = Number(match[1]);
  const max = Number(match[2]);
  assert(min === 6 && max === 10,
    `${label}: ${functionName} must accept numeric OTP codes from 6 to 10 digits`);
  const normalize = (input) => {
    const code = String(input || "").trim();
    return new RegExp(`^[0-9]{${min},${max}}$`).test(code) ? code : "";
  };
  assert(normalize("123456") === "123456",
    `${label}: ${functionName} must accept 6-digit OTP codes`);
  assert(normalize("67626320") === "67626320",
    `${label}: ${functionName} must accept Supabase 8-digit OTP codes`);
  assert(normalize(" 67626320 ") === "67626320",
    `${label}: ${functionName} must trim whitespace around OTP codes`);
  for (const bad of ["", "12345", "12345678901", "1234abcd", "123 456", "<script>67626320</script>"]) {
    assert(normalize(bad) === "",
      `${label}: ${functionName} must reject invalid OTP code ${JSON.stringify(bad)}`);
  }
}

const PROVIDER_AND_TOKEN_PATTERNS = [
  ["provider SDK import", /@supabase\/supabase-js/],
  ["provider package namespace", /@supabase\//],
  ["Supabase URL", /https:\/\/[a-z0-9-]+\.supabase\.co/i],
  ["forbidden token field", /\b(access_token|refresh_token|id_token|provider_token|auth_code|otp_token_hash)\b/i],
  ["service role", /\b(service_role|service-role)\b/i],
  ["anon key label", /\banon[\s_-]*key\b/i],
  ["JWT-like value", /eyJ[A-Za-z0-9_-]{40,}/],
  ["provider auth call", /\b(signInWithOtp|verifyOtp|createClient|launchWebAuthFlow)\s*\(/],
];

const PROVIDER_SOURCE_FORBIDDEN_PATTERNS = [
  ["Supabase URL", /https:\/\/[a-z0-9-]+\.supabase\.co/i],
  ["forbidden token field", /\b(auth_code|otp_token_hash)\b/i],
  ["service role", /\b(service_role|service-role)\b/i],
  ["anon key label", /\banon[\s_-]*key\b/i],
  ["JWT-like value", /eyJ[A-Za-z0-9_-]{40,}/],
  ["forbidden provider auth/session call", /\b(getSession|launchWebAuthFlow|signInWithIdToken)\s*\(/],
  ["network API", /\b(XMLHttpRequest|WebSocket|EventSource)\s*\(/],
  ["chrome API", /\bchrome\./],
  ["storage API", /\b(localStorage|sessionStorage|indexedDB)\b/],
  ["document global", /(^|[^\w$])document\b/],
  ["window global", /(^|[^\w$])window\b/],
  ["H2O page object", /(^|[^\w$])H2O\./],
  ["window H2O object", /\bwindow\.H2O\b/],
  ["global H2O object", /\bglobalThis\.H2O(?!_IDENTITY_PROVIDER_BUNDLE_PROBE\b)/],
  ["CommonJS import", /\brequire\s*\(/],
];

function assertProviderProbeMetadata(label, source) {
  assert(/ok\s*:\s*(?:true|!0)/.test(source), `${label}: provider probe ok flag missing`);
  assert(new RegExp(`version\\s*:\\s*"${SDK_PROBE_PHASE.replace(".", "\\.")}"`).test(source), `${label}: provider probe version missing`);
  assert(new RegExp(`phase\\s*:\\s*"${SDK_PROBE_PHASE.replace(".", "\\.")}"`).test(source), `${label}: provider probe phase missing`);
  assert(new RegExp(`kind\\s*:\\s*"${SDK_PROBE_KIND}"`).test(source), `${label}: provider probe kind missing`);
  assert(/surface\s*:\s*"background"/.test(source), `${label}: provider probe surface missing`);
  assert(source.includes("adapter"), `${label}: adapter metadata missing`);
  assert(/providerKind\s*:\s*"supabase"/.test(source), `${label}: adapter providerKind missing`);
  assert(/adapterLoaded\s*:\s*(?:true|!0)/.test(source), `${label}: adapterLoaded true missing`);
  assert(source.includes("clientFactoryPresent"), `${label}: clientFactoryPresent metadata missing`);
  assert(/clientCreated\s*:\s*(?:false|!1)/.test(source), `${label}: adapter clientCreated false missing`);
  assert(/clientCreatedAtImport\s*:\s*(?:false|!1)/.test(source), `${label}: adapter clientCreatedAtImport false missing`);
  assert(/clientSmokeAvailable\s*:\s*(?:true|!0)/.test(source), `${label}: clientSmokeAvailable true missing`);
  assert(/realConfigSmokeAvailable\s*:\s*(?:true|!0)/.test(source), `${label}: realConfigSmokeAvailable true missing`);
  assert(/configPresent\s*:\s*(?:false|!1)/.test(source), `${label}: adapter configPresent false missing`);
  assert(/networkEnabled\s*:\s*(?:false|!1)/.test(source), `${label}: adapter networkEnabled false missing`);
  assert(/networkObserved\s*:\s*(?:false|!1)/.test(source), `${label}: networkObserved false missing`);
  assert(/authCallsObserved\s*:\s*(?:false|!1)/.test(source), `${label}: authCallsObserved false missing`);
  assert(/otpEnabled\s*:\s*(?:false|!1)/.test(source), `${label}: otpEnabled false missing`);
  assert(source.includes("supportedPlannedOps"), `${label}: supportedPlannedOps missing`);
  for (const op of ADAPTER_PLANNED_OPS) {
    assert(source.includes(`"${op}"`), `${label}: planned op ${op} missing`);
  }
  assert(source.includes("sdkImport"), `${label}: sdkImport metadata missing`);
  assert(new RegExp(`package\\s*:\\s*"${SDK_DIAG_PACKAGE}"`).test(source), `${label}: sdkImport package must use generic diagnostic label`);
  assert(source.includes("importOk:"), `${label}: sdkImport importOk missing`);
  assert(/clientCreated\s*:\s*(?:false|!1)/.test(source), `${label}: sdkImport clientCreated false missing`);
  assert(/networkEnabled\s*:\s*(?:false|!1)/.test(source), `${label}: sdkImport networkEnabled false missing`);
  assert(source.includes("clientSmoke"), `${label}: clientSmoke metadata missing`);
  assert(source.includes("realConfigSmoke"), `${label}: realConfigSmoke metadata missing`);
  assert(source.includes("runClientSmoke"), `${label}: lazy runClientSmoke hook missing`);
  assert(source.includes("runRealConfigClientSmoke"), `${label}: lazy runRealConfigClientSmoke hook missing`);
  assert(source.includes("requestEmailOtp"), `${label}: request-email-OTP hook missing`);
  assert(source.includes("verifyEmailOtp"), `${label}: verify-email-OTP hook missing`);
  assert(source.includes("verifySignupEmailCode"), `${label}: signup confirmation verify hook missing`);
  assert(source.includes("signUpWithPassword"), `${label}: sign-up-with-password hook missing`);
  assert(source.includes("resendSignupConfirmation"), `${label}: signup confirmation resend hook missing`);
  assert(source.includes("signInWithPassword"), `${label}: sign-in-with-password hook missing`);
  assert(source.includes("requestPasswordReset"), `${label}: password reset request hook missing`);
  assert(source.includes("updatePasswordAfterRecovery"), `${label}: password recovery update hook missing`);
  assert(source.includes("beginOAuthSignIn"), `${label}: OAuth begin hook missing`);
  assert(source.includes("completeOAuthSignIn"), `${label}: OAuth complete hook missing`);
  assert(source.includes("refreshProviderSession"), `${label}: refresh provider session hook missing`);
  assert(source.includes("signOutProviderSession"), `${label}: sign-out provider session hook missing`);
  assert(source.includes("completeOnboarding"), `${label}: complete onboarding hook missing`);
  assert(source.includes("loadIdentityState"), `${label}: load identity state hook missing`);
  assert(source.includes("markOAuthCredentialCompleted"), `${label}: mark OAuth credential hook missing`);
  assert(source.includes(`globalThis.${PROBE_MARKER}`), `${label}: safe global marker assignment missing`);
  assert(!new RegExp(`package\\s*:\\s*"${SDK_PACKAGE_NAME.replace("/", "\\/")}"`).test(source),
    `${label}: raw SDK package name must not be exposed in probe metadata`);
}

function assertProviderSourceSafe(label, source) {
  assert(source.includes(`from "${SDK_PACKAGE_NAME}"`), `${label}: provider SDK import missing`);
  assert(source.includes("Object.keys(ProviderSdk"), `${label}: SDK namespace import must be observed without calling SDK APIs`);
  assert(source.includes('typeof ProviderSdk.createClient === "function"'), `${label}: adapter smoke must check client factory presence as metadata only`);
  assert(source.includes(`const SMOKE_PROVIDER_URL = "${SMOKE_PROVIDER_URL}"`), `${label}: reserved .invalid smoke URL missing`);
  assert(source.includes(`const SMOKE_PUBLIC_CLIENT = "${SMOKE_PUBLIC_CLIENT}"`), `${label}: non-token smoke public client missing`);
  assert(source.includes("function runClientSmoke()"), `${label}: named lazy runClientSmoke function missing`);
  assert(source.includes("function guardedSmokeFetch()"), `${label}: guarded local smoke fetch missing`);
  assert(source.includes("fetch: guardedSmokeFetch"), `${label}: createClient must receive guarded smoke fetch`);
  assert(source.includes("function runRealConfigClientSmoke(config)"), `${label}: named lazy runRealConfigClientSmoke function missing`);
  assert(source.includes("function guardedRealConfigFetch()"), `${label}: guarded real-config fetch missing`);
  assert(source.includes("fetch: guardedRealConfigFetch"), `${label}: real-config createClient must receive guarded fetch`);
  assert(source.includes("async function requestEmailOtp(config, input = {})"), `${label}: request-email-OTP helper missing`);
  assert(source.includes("client.auth.signInWithOtp"), `${label}: signInWithOtp must be confined to the provider request-email-OTP helper`);
  assert(source.includes("async function verifyEmailOtp(config, input = {})"), `${label}: verify-email-OTP helper missing`);
  assert(source.includes("client.auth.verifyOtp"), `${label}: verifyOtp must be confined to the provider verify-email-OTP helper`);
  assert(source.includes("async function verifySignupEmailCode(config, input = {})"), `${label}: signup confirmation verify helper missing`);
  assert(source.includes('client.auth.verifyOtp({ email, token: code, type: "email" })'), `${label}: signup confirmation must verify email OTP codes with type email`);
  assert(source.includes("async function signUpWithPassword(config, input = {})"), `${label}: sign-up-with-password helper missing`);
  assert(source.includes("client.auth.signUp"), `${label}: signUp must be confined to the provider password sign-up helper`);
  assert(source.includes("async function resendSignupConfirmation(config, input = {})"), `${label}: signup confirmation resend helper missing`);
  assert(source.includes('client.auth.resend({ type: "signup", email })'), `${label}: signup confirmation resend must be confined to provider helper`);
  assert(source.includes("async function signInWithPassword(config, input = {})"), `${label}: sign-in-with-password helper missing`);
  assert(source.includes("client.auth.signInWithPassword"), `${label}: signInWithPassword must be confined to the provider password sign-in helper`);
  assert(source.includes("async function requestPasswordReset(config, input = {})"), `${label}: password reset request helper missing`);
  assert(source.includes("client.auth.resetPasswordForEmail"), `${label}: resetPasswordForEmail must be confined to the provider password reset helper`);
  assert(source.includes("async function updatePasswordAfterRecovery(config, input = {})"), `${label}: password recovery update helper missing`);
  assert(source.includes("client.auth.updateUser"), `${label}: updateUser must be confined to approved provider password helpers`);
  assert(source.includes("async function changePassword(config, input = {})"), `${label}: signed-in password change helper missing`);
  assert(source.includes("current_password: currentPassword"), `${label}: signed-in password change must use installed SDK current_password field`);
  assert(!source.includes("currentPassword:"), `${label}: signed-in password change must not use unsupported currentPassword field casing`);
  assert(source.includes("async function beginOAuthSignIn(config, input = {})"), `${label}: Google OAuth begin helper missing`);
  assert(source.includes("client.auth.signInWithOAuth"), `${label}: signInWithOAuth must be confined to the provider Google OAuth begin helper`);
  assert(source.includes("async function completeOAuthSignIn(config, input = {})"), `${label}: Google OAuth complete helper missing`);
  assert(source.includes("client.auth.exchangeCodeForSession"), `${label}: exchangeCodeForSession must be confined to the provider Google OAuth complete helper`);
  assert(source.includes("async function refreshProviderSession(config, refreshTokenInput)"), `${label}: refresh provider session helper missing`);
  assert(source.includes("client.auth.refreshSession"), `${label}: refreshSession must be confined to the provider refresh helper`);
  assert(source.includes("function normalizeProviderSessionForInternalStorage("),
    `${label}: provider verify/refresh helpers must normalize raw session into the hydration-compatible internal storage shape`);
  assert(source.includes("normalizeProviderSessionForInternalStorage(rawSession, user, email)"),
    `${label}: verify helper must store a raw session shape that includes the verified user/email`);
  assert(source.includes("normalizeProviderSessionForInternalStorage(rawSession, user)"),
    `${label}: refresh helper must store the same raw session shape used by verify`);
  assert(source.includes("rawSession: providerSession"),
    `${label}: provider helpers must return the normalized raw session for background-only storage`);
  assert(source.includes("async function signOutProviderSession(config, input = {})"), `${label}: sign-out provider session helper missing`);
  assert(source.includes("client.auth.signOut"), `${label}: signOut must be confined to the provider sign-out helper`);
  assert(source.includes('client.auth.signOut({ scope: "local" })'), `${label}: provider sign-out must use local scope explicitly`);
  assert(!/scope\s*:\s*["']global["']/.test(source), `${label}: provider sign-out must never use global scope`);
  assert(!/\bsetSession\s*\(/.test(source), `${label}: provider sign-out must not use setSession`);
  assert(source.includes("createEphemeralProviderStorage"), `${label}: provider sign-out must use helper-local ephemeral storage`);
  assert(source.includes("persistSession: true"), `${label}: provider sign-out helper must use SDK storage only through ephemeral storage`);
  assert(source.includes("async function completeOnboarding(config, input = {})"), `${label}: complete-onboarding RPC helper missing`);
  assert(source.includes('client.rpc("complete_onboarding"'), `${label}: complete_onboarding RPC call must be confined to provider helper`);
  assert(source.includes("async function updateIdentityProfile(config, input = {})"), `${label}: profile update RPC helper missing`);
  assert(source.includes('client.rpc("update_identity_profile"'), `${label}: update_identity_profile RPC call must be confined to provider helper`);
  assert(source.includes("async function renameIdentityWorkspace(config, input = {})"), `${label}: workspace rename RPC helper missing`);
  assert(source.includes('client.rpc("rename_identity_workspace"'), `${label}: rename_identity_workspace RPC call must be confined to provider helper`);
  assert(source.includes("async function loadIdentityState(config, input = {})"), `${label}: load-identity-state RPC helper missing`);
  assert(source.includes('client.rpc("load_identity_state"'), `${label}: load_identity_state RPC call must be confined to provider helper`);
  assert(source.includes("async function markPasswordSetupCompleted(config, input = {})"), `${label}: mark-password-setup RPC helper missing`);
  assert(source.includes('client.rpc("mark_password_setup_completed"'), `${label}: mark_password_setup_completed RPC call must be confined to provider helper`);
  assert(source.includes("async function markOAuthCredentialCompleted(config, input = {})"), `${label}: mark-OAuth-credential RPC helper missing`);
  assert(source.includes('client.rpc("mark_oauth_credential_completed"'), `${label}: mark_oauth_credential_completed RPC call must be confined to provider helper`);
  assert(source.includes("Authorization: `Bearer ${accessToken}`"), `${label}: complete_onboarding helper must attach only the current access token as a request header`);
  assert(!/\.from\s*\(/.test(source), `${label}: provider source must not use direct table access`);
  assertOtpCodeNormalizer(label, source, "normalizeProviderOtpCode");
  const createClientIndices = [...source.matchAll(/ProviderSdk\.createClient\s*\(/g)].map((match) => match.index);
  const helperOrder = [
    ["runClientSmoke", "function runClientSmoke()"],
    ["runRealConfigClientSmoke", "function runRealConfigClientSmoke(config)"],
    ["requestEmailOtp", "async function requestEmailOtp(config, input = {})"],
    ["verifyEmailOtp", "async function verifyEmailOtp(config, input = {})"],
    ["verifySignupEmailCode", "async function verifySignupEmailCode(config, input = {})"],
    ["signUpWithPassword", "async function signUpWithPassword(config, input = {})"],
    ["resendSignupConfirmation", "async function resendSignupConfirmation(config, input = {})"],
    ["signInWithPassword", "async function signInWithPassword(config, input = {})"],
    ["requestPasswordReset", "async function requestPasswordReset(config, input = {})"],
    ["updatePasswordAfterRecovery", "async function updatePasswordAfterRecovery(config, input = {})"],
    ["changePassword", "async function changePassword(config, input = {})"],
    ["beginOAuthSignIn", "async function beginOAuthSignIn(config, input = {})"],
    ["completeOAuthSignIn", "async function completeOAuthSignIn(config, input = {})"],
    ["refreshProviderSession", "async function refreshProviderSession(config, refreshTokenInput)"],
    ["signOutProviderSession", "async function signOutProviderSession(config, input = {})"],
    ["completeOnboarding", "async function completeOnboarding(config, input = {})"],
    ["updateIdentityProfile", "async function updateIdentityProfile(config, input = {})"],
    ["renameIdentityWorkspace", "async function renameIdentityWorkspace(config, input = {})"],
    ["loadIdentityState", "async function loadIdentityState(config, input = {})"],
    ["registerDeviceSession", "async function registerDeviceSession(config, accessToken, input = {})"],
    ["markPasswordSetupCompleted", "async function markPasswordSetupCompleted(config, input = {})"],
    ["markOAuthCredentialCompleted", "async function markOAuthCredentialCompleted(config, input = {})"],
  ];
  assert(createClientIndices.length === helperOrder.length,
    `${label}: ProviderSdk.createClient must appear only in approved provider helpers`);
  const helperIndices = helperOrder.map(([name, marker]) => {
    const index = source.indexOf(marker);
    assert(index >= 0, `${label}: ${name} helper marker missing`);
    return { name, index };
  });
  for (let i = 0; i < helperIndices.length; i += 1) {
    const helper = helperIndices[i];
    const next = helperIndices[i + 1];
    assert(createClientIndices[i] > helper.index,
      `${label}: ProviderSdk.createClient must be inside ${helper.name}`);
    if (next) {
      assert(createClientIndices[i] < next.index,
        `${label}: ProviderSdk.createClient must be confined to ${helper.name}`);
    }
  }
  const verifyEmailOtpIndex = source.indexOf("async function verifyEmailOtp(config, input = {})");
  const verifySignupEmailCodeIndex = source.indexOf("async function verifySignupEmailCode(config, input = {})");
  const signUpWithPasswordIndex = source.indexOf("async function signUpWithPassword(config, input = {})");
  const resendSignupConfirmationIndex = source.indexOf("async function resendSignupConfirmation(config, input = {})");
  const signInWithPasswordIndex = source.indexOf("async function signInWithPassword(config, input = {})");
  const requestPasswordResetIndex = source.indexOf("async function requestPasswordReset(config, input = {})");
  const updatePasswordAfterRecoveryIndex = source.indexOf("async function updatePasswordAfterRecovery(config, input = {})");
  const changePasswordIndex = source.indexOf("async function changePassword(config, input = {})");
  const beginOAuthSignInIndex = source.indexOf("async function beginOAuthSignIn(config, input = {})");
  const completeOAuthSignInIndex = source.indexOf("async function completeOAuthSignIn(config, input = {})");
  const refreshProviderSessionIndex = source.indexOf("async function refreshProviderSession(config, refreshTokenInput)");
  const signOutProviderSessionIndex = source.indexOf("async function signOutProviderSession(config, input = {})");
  const completeOnboardingIndex = source.indexOf("async function completeOnboarding(config, input = {})");
  const updateIdentityProfileIndex = source.indexOf("async function updateIdentityProfile(config, input = {})");
  const renameIdentityWorkspaceIndex = source.indexOf("async function renameIdentityWorkspace(config, input = {})");
  const loadIdentityStateIndex = source.indexOf("async function loadIdentityState(config, input = {})");
  const markPasswordSetupCompletedIndex = source.indexOf("async function markPasswordSetupCompleted(config, input = {})");
  const markOAuthCredentialCompletedIndex = source.indexOf("async function markOAuthCredentialCompleted(config, input = {})");
  const registerDeviceSessionIndex = source.indexOf("async function registerDeviceSession(config, accessToken, input = {})");
  const verifyOtpMatches = source.match(/\bverifyOtp\s*\(/g) || [];
  const verifyOtpCall = 'client.auth.verifyOtp({ email, token: code, type: "email" })';
  assert(verifyOtpMatches.length === 2 &&
    source.indexOf(verifyOtpCall, verifyEmailOtpIndex) > verifyEmailOtpIndex &&
    source.indexOf(verifyOtpCall, verifySignupEmailCodeIndex) > verifySignupEmailCodeIndex,
    `${label}: verifyOtp calls must appear only inside verifyEmailOtp and verifySignupEmailCode`);
  const signUpMatches = source.match(/\bsignUp\s*\(/g) || [];
  assert(signUpMatches.length === 1 && source.indexOf("client.auth.signUp") > signUpWithPasswordIndex,
    `${label}: signUp call must appear exactly once inside signUpWithPassword`);
  const resendMatches = source.match(/\bclient\.auth\.resend\s*\(/g) || [];
  assert(resendMatches.length === 1 && source.indexOf("client.auth.resend") > resendSignupConfirmationIndex,
    `${label}: auth.resend call must appear exactly once inside resendSignupConfirmation`);
  const signInWithPasswordMatches = source.match(/\bclient\.auth\.signInWithPassword\s*\(/g) || [];
  assert(signInWithPasswordMatches.length === 1 && source.indexOf("client.auth.signInWithPassword") > signInWithPasswordIndex,
    `${label}: signInWithPassword call must appear exactly once inside signInWithPassword`);
  const resetPasswordMatches = source.match(/\bresetPasswordForEmail\s*\(/g) || [];
  assert(resetPasswordMatches.length === 1 && source.indexOf("client.auth.resetPasswordForEmail") > requestPasswordResetIndex,
    `${label}: resetPasswordForEmail call must appear exactly once inside requestPasswordReset`);
  const updateUserMatches = source.match(/\bupdateUser\s*\(/g) || [];
  const recoveryUpdateUserIndex = source.indexOf("client.auth.updateUser({ password })");
  const accountChangeUpdateUserIndex = source.indexOf("client.auth.updateUser({", changePasswordIndex);
  assert(updateUserMatches.length === 2 &&
      recoveryUpdateUserIndex > updatePasswordAfterRecoveryIndex &&
      recoveryUpdateUserIndex < changePasswordIndex &&
      accountChangeUpdateUserIndex > changePasswordIndex,
    `${label}: updateUser calls must appear only inside updatePasswordAfterRecovery and changePassword`);
  const signInWithOAuthMatches = source.match(/\bsignInWithOAuth\s*\(/g) || [];
  assert(signInWithOAuthMatches.length === 1 && source.indexOf("client.auth.signInWithOAuth") > beginOAuthSignInIndex,
    `${label}: signInWithOAuth call must appear exactly once inside beginOAuthSignIn`);
  const exchangeCodeMatches = source.match(/\bexchangeCodeForSession\s*\(/g) || [];
  assert(exchangeCodeMatches.length === 1 && source.indexOf("client.auth.exchangeCodeForSession") > completeOAuthSignInIndex,
    `${label}: exchangeCodeForSession call must appear exactly once inside completeOAuthSignIn`);
  const refreshSessionMatches = source.match(/\brefreshSession\s*\(/g) || [];
  assert(refreshSessionMatches.length === 1 && source.indexOf("client.auth.refreshSession") > refreshProviderSessionIndex,
    `${label}: refreshSession call must appear exactly once inside refreshProviderSession`);
  const signOutMatches = source.match(/\bsignOut\s*\(/g) || [];
  assert(signOutMatches.length === 1 && source.indexOf("client.auth.signOut") > signOutProviderSessionIndex,
    `${label}: signOut call must appear exactly once inside signOutProviderSession`);
  const rpcMatches = source.match(/\.rpc\s*\(/g) || [];
  assert(rpcMatches.length === 7
      && source.indexOf('client.rpc("complete_onboarding"') > completeOnboardingIndex
      && source.indexOf('client.rpc("update_identity_profile"') > updateIdentityProfileIndex
      && source.indexOf('client.rpc("rename_identity_workspace"') > renameIdentityWorkspaceIndex
      && source.indexOf('client.rpc("load_identity_state"') > loadIdentityStateIndex
      && source.indexOf('client.rpc("mark_password_setup_completed"') > markPasswordSetupCompletedIndex
      && source.indexOf('client.rpc("mark_oauth_credential_completed"') > markOAuthCredentialCompletedIndex
      && source.indexOf('client.rpc("register_device_session"') > registerDeviceSessionIndex,
    `${label}: RPC calls must appear exactly once inside approved identity provider RPC helpers`);
  assert(!/\bglobalThis\.fetch\s*=|\bself\.fetch\s*=|\bwindow\.fetch\s*=/.test(source),
    `${label}: smoke must not patch global fetch`);
  assertProviderProbeMetadata(label, source);
  assertNoPatterns(label, source, PROVIDER_SOURCE_FORBIDDEN_PATTERNS);
}

function assertProviderBundleOutputSafe(label, source) {
  assertProviderProbeMetadata(label, source);
  assert(source.includes(SMOKE_PROVIDER_URL), `${label}: built bundle missing reserved .invalid smoke URL`);
  assert(source.includes(SMOKE_PUBLIC_CLIENT), `${label}: built bundle missing non-token smoke public client`);
  assert(source.includes("clientCreatedAtImport"), `${label}: built bundle missing clientCreatedAtImport metadata`);
  assert(source.includes("networkObserved"), `${label}: built bundle missing networkObserved metadata`);
  assert(source.includes("authCallsObserved"), `${label}: built bundle missing authCallsObserved metadata`);
  assert(source.includes("otpEnabled"), `${label}: built bundle missing otpEnabled metadata`);
  assert(source.includes("signInWithOtp"), `${label}: built bundle missing provider request-email-OTP call`);
  assert(source.includes("verifyOtp"), `${label}: built bundle missing provider verify-email-OTP call`);
  assert(source.includes("signUp"), `${label}: built bundle missing provider password signUp call`);
  assert(source.includes("signInWithPassword"), `${label}: built bundle missing provider password signInWithPassword call`);
  assert(source.includes("resetPasswordForEmail"), `${label}: built bundle missing provider password reset request call`);
  assert(source.includes("updateUser"), `${label}: built bundle missing provider password recovery update call`);
  assert(source.includes("current_password"), `${label}: built bundle missing provider signed-in password change current_password field`);
  assert(source.includes("signInWithOAuth"), `${label}: built bundle missing provider Google OAuth start call`);
  assert(source.includes("exchangeCodeForSession"), `${label}: built bundle missing provider Google OAuth exchange call`);
  assert(source.includes("refreshSession"), `${label}: built bundle missing provider refreshSession call`);
  assert(source.includes("access_token") && source.includes("expires_at") && /\buser\s*:\s*\{/.test(source),
    `${label}: built bundle must normalize provider sessions into the hydration-compatible storage shape`);
  assert(/\brawSession\s*:\s*[A-Za-z_$][\w$]*/.test(source),
    `${label}: built bundle must return normalized raw sessions for background-only storage`);
  assert(source.includes("signOut"), `${label}: built bundle missing provider signOut call`);
  assert(source.includes("local"), `${label}: built bundle missing local sign-out scope`);
  assert(source.includes("complete_onboarding"), `${label}: built bundle missing approved complete_onboarding RPC call`);
  assert(source.includes("update_identity_profile"), `${label}: built bundle missing approved update_identity_profile RPC call`);
  assert(source.includes("rename_identity_workspace"), `${label}: built bundle missing approved rename_identity_workspace RPC call`);
  assert(source.includes("load_identity_state"), `${label}: built bundle missing approved load_identity_state RPC call`);
  assert(source.includes("mark_password_setup_completed"), `${label}: built bundle missing approved mark_password_setup_completed RPC call`);
  assert(source.includes("mark_oauth_credential_completed"), `${label}: built bundle missing approved mark_oauth_credential_completed RPC call`);
}

function assertBackgroundOnboardingSessionBoundary() {
  const source = read("tools/product/extension/chrome-live-background.mjs");
  assert(source.includes("identityProviderSession_storeRaw(providerVerify.providerResult)"),
    "verify success path must store the provider result raw session under the provider session key");
  assert(source.includes("function identityProviderSession_unwrapStoredSession("),
    "background must unwrap direct/wrapped provider session shapes from chrome.storage.session");
  assert(source.includes("function identityProviderSession_normalizeStoredSession("),
    "background must normalize stored sessions before verify/refresh/signOut/onboarding reuse");
  assert(source.includes("function identityProviderSession_makeRpcSessionForOnboarding("),
    "complete-onboarding must compact the stored provider session into an explicit access_token RPC session");
  assert(source.includes("src.access_token || src.accessToken"),
    "complete-onboarding session reader must accept the stored verify shape including camel-case accessToken fallback");
  assert(source.includes("async function identityProviderSession_readRpcSessionForOnboarding("),
    "complete-onboarding must use a dedicated chrome.storage.session raw-session read helper");
  const start = source.indexOf("async function identityProviderSession_readRpcSessionForOnboarding(");
  const end = source.indexOf("async function identityProviderSession_clearExpired(", start);
  assert(start >= 0 && end > start, "complete-onboarding raw-session helper block must be extractable");
  const block = source.slice(start, end);
  assert(block.includes("identityProviderSession_readStoredValueForOnboarding()"),
    "complete-onboarding must read the exact stored provider session key before normalization");
  assert(source.includes("const accessToken = identityProviderSession_accessToken(src);"),
    "complete-onboarding RPC session compactor must require a usable access token");
  assert(source.includes("/[\\\\s<>]/.test(token)"),
    "generated background source must double-escape whitespace token validators before template emission");
  assert(block.includes("identityProviderSession_makeRpcSessionForOnboarding(rawSession)"),
    "complete-onboarding must pass the provider helper an explicit access_token RPC session");
  assert(!block.includes("identityProviderSession_extractSafeRuntime"),
    "complete-onboarding raw-session helper must not require the public hydration shape");
  assert(source.includes("identityProviderSession_readRpcSessionForOnboarding(rt)"),
    "complete-onboarding manager must call the raw-session helper before provider RPC");
  assert(source.includes("function identityProviderOnboarding_sanitizeDiagnostics("),
    "complete-onboarding must retain internal safe diagnostic helpers for validation");
  assert(source.includes("providerSessionTopLevelKeys"),
    "complete-onboarding internal diagnostics must include safe top-level key names without values");
  assert(source.includes("function identityProviderOnboarding_hasProviderSessionStatus("),
    "complete-onboarding must use an explicit provider session status helper");
  const managerStart = source.indexOf("async function identityAuthManager_completeOnboarding(");
  const managerEnd = source.indexOf("async function identityAuthManager_attachLocalProfile(", managerStart);
  assert(managerStart >= 0 && managerEnd > managerStart, "complete-onboarding manager block must be extractable");
  const managerBlock = source.slice(managerStart, managerEnd);
  assert(managerBlock.indexOf("identityProviderSession_readRpcSessionForOnboarding(rt)") >= 0,
    "complete-onboarding manager must read the provider session");
  assert(managerBlock.indexOf("identityProviderSession_readRpcSessionForOnboarding(rt)")
      < managerBlock.indexOf("identityProviderOnboarding_hasProviderSessionStatus(latestRt)"),
    "complete-onboarding must read a valid raw provider session before considering stale runtime status");
  assert(managerBlock.includes("identityProviderSession_extractSafeRuntime(rpcSession.rawSession)"),
    "complete-onboarding must rebuild safe provider runtime from a valid raw session when runtime is stale");
  assert(!managerBlock.includes('return identityProviderOnboarding_failure("identity/onboarding-session-missing");'),
    "complete-onboarding provider branch must route session-missing through the production-safe failure helper");
  assert(source.includes("identityProviderBundleProbeState.loadIdentityStateRunner"),
    "background must capture load-identity-state runner privately");
  assert(source.includes("identityProviderBundleProbeState.markPasswordSetupCompletedRunner"),
    "background must capture mark-password-setup runner privately");
  assert(source.includes("async function identityProviderBundle_loadIdentityState("),
    "background must call load_identity_state only through a named provider bundle helper");
  assert(source.includes("async function identityProviderSession_tryCloudIdentityRestore("),
    "background wake hydration must include a read-only cloud identity restore helper");
  assert(source.includes("identityProviderBundle_loadIdentityState({ rawSession: rpcSession })"),
    "background cloud restore path must pass only the compact raw session to the load_identity_state helper");
  assert(source.includes("identityProviderCloudLoad_sanitizeProviderResult"),
    "background must sanitize load_identity_state provider results before public state");
  assert(source.includes("identityProviderCredentialState_markCompleteForSession"),
    "background must mark password setup completion only through the provider RPC helper");
}

function assertScriptParses(label, source) {
  try {
    new Function(source);
  } catch (error) {
    throw new Error(`FAIL: ${label} does not parse: ${error?.message || error}`);
  }
}

function assertBuiltOnboardingDirectSessionFixture(label, bgSource) {
  assert(!bgSource.includes("/[s<>]/.test(token)"),
    `${label}: built token validators must reject whitespace, not the literal letter s`);
  assert(bgSource.includes("/[\\s<>]/.test(token)"),
    `${label}: built token validators must preserve the whitespace escape`);
  const start = bgSource.indexOf("const IDENTITY_PROVIDER_SESSION_EXPIRY_SKEW_MS");
  const end = bgSource.indexOf("function identityProviderSession_signOutUsable(", start);
  assert(start >= 0 && end > start,
    `${label}: built provider session helper block must be extractable`);
  const block = bgSource.slice(start, end);
  const result = new Function(`${block}
    const storedValue = {
      access_token: "validator_token_with_safe_s_letter",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      refresh_token: "validator_refresh_with_safe_s_letter",
      token_type: "bearer",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "validator@example.invalid" }
    };
    const rpcSession = identityProviderSession_makeRpcSessionForOnboarding(storedValue);
    const diagnostics = identityProviderSession_onboardingDiagnostics(storedValue, rpcSession, {
      status: "verified_no_profile",
      mode: "provider_backed",
      provider: "supabase"
    });
    return { rpcSession, diagnostics };
  `)();
  assert(result.rpcSession && result.rpcSession.access_token === "validator_token_with_safe_s_letter",
    `${label}: direct snake-case provider session must build an access_token RPC session`);
  assert(result.diagnostics.rawHasAccessToken === true,
    `${label}: diagnostics must report rawHasAccessToken for direct snake-case sessions`);
  assert(result.diagnostics.normalizedHasAccessToken === true,
    `${label}: diagnostics must report normalizedHasAccessToken for direct snake-case sessions`);
  assert(result.diagnostics.rpcSessionBuilt === true,
    `${label}: diagnostics must report rpcSessionBuilt for direct snake-case sessions`);
  assert(result.diagnostics.callerSawAccessToken === true,
    `${label}: diagnostics must report callerSawAccessToken for direct snake-case sessions`);
}

function makeBuiltProbeEvalCode(variant, bgSource, injectedStatus) {
  const start = bgSource.indexOf("const IDENTITY_PROVIDER_BUNDLE_PATH");
  const end = bgSource.indexOf("async function identityRuntime_get(");
  assert(start >= 0 && end > start, `${variant}: cannot extract built provider bundle/config block`);
  let block = bgSource.slice(start, end);
  const injectedStatusPattern = /const IDENTITY_PROVIDER_CONFIG_INJECTED_STATUS = [^\n]+;\n/;
  assert(injectedStatusPattern.test(block), `${variant}: cannot replace built injected provider status`);
  block = block.replace(
    injectedStatusPattern,
    `const IDENTITY_PROVIDER_CONFIG_INJECTED_STATUS = ${JSON.stringify(injectedStatus)};\n`,
  );
  return `
    let importCount = 0;
    const importedPaths = [];
    function importScripts(path) {
      importCount += 1;
      const importedPath = String(path || "");
      importedPaths.push(importedPath);
      if (importedPath === "${PRIVATE_CONFIG_REL}") {
        globalThis.${PRIVATE_CONFIG_GLOBAL} = Object.freeze({
          phase: "3.0Y",
          kind: "identity-provider-private-config",
          providerKind: "supabase",
          configSource: "dev_env",
          projectUrl: "${REAL_CONFIG_SMOKE_PROVIDER_URL}",
          publicClient: "${REAL_CONFIG_SMOKE_PUBLIC_CLIENT}"
        });
        return;
      }
      if (importedPath !== "${PROVIDER_BUNDLE_REL}") {
        throw new Error("unexpected import path " + importedPath);
      }
      globalThis.${PROBE_MARKER} = {
        ok: true,
        version: "${SDK_PROBE_PHASE}",
        phase: "${SDK_PROBE_PHASE}",
        kind: "${SDK_PROBE_KIND}",
        surface: "background",
        adapter: {
          providerKind: "supabase",
          adapterLoaded: true,
          clientFactoryPresent: true,
          clientCreated: false,
          clientCreatedAtImport: false,
          clientSmokeAvailable: true,
          configPresent: false,
          networkEnabled: false,
          networkObserved: false,
          authCallsObserved: false,
          otpEnabled: false,
          supportedPlannedOps: ${JSON.stringify(ADAPTER_PLANNED_OPS)}
        },
        sdkImport: {
          package: "${SDK_DIAG_PACKAGE}",
          importOk: true,
          clientCreated: false,
          networkEnabled: false,
          networkObserved: false,
          authCallsObserved: false,
          otpEnabled: false
        },
        clientSmoke: {
          clientSmokeAvailable: true,
          clientCreatedAtImport: false,
          clientCreated: false,
          networkEnabled: false,
          networkObserved: false,
          authCallsObserved: false,
          otpEnabled: false,
          smokeRun: false,
          errorCode: null
        },
        realConfigSmoke: {
          realConfigSmokeAvailable: true,
          realConfigSmokeRun: false,
          realConfigClientCreated: false,
          realConfigNetworkObserved: false,
          realConfigAuthCallsObserved: false,
          realConfigOtpEnabled: false,
          errorCode: null
        },
        runClientSmoke() {
          return {
            clientSmokeAvailable: true,
            clientCreatedAtImport: false,
            clientCreated: true,
            networkEnabled: false,
            networkObserved: false,
            authCallsObserved: false,
            otpEnabled: false,
            smokeRun: true,
            errorCode: null
          };
        },
        runRealConfigClientSmoke(config) {
          if (!config || config.projectUrl !== "${REAL_CONFIG_SMOKE_PROVIDER_URL}" || config.publicClient !== "${REAL_CONFIG_SMOKE_PUBLIC_CLIENT}") {
            return {
              realConfigSmokeAvailable: true,
              realConfigSmokeRun: true,
              realConfigClientCreated: false,
              realConfigNetworkObserved: false,
              realConfigAuthCallsObserved: false,
              realConfigOtpEnabled: false,
              errorCode: "validator_private_config_missing"
            };
          }
          return {
            realConfigSmokeAvailable: true,
            realConfigSmokeRun: true,
            realConfigClientCreated: true,
            realConfigNetworkObserved: false,
            realConfigAuthCallsObserved: false,
            realConfigOtpEnabled: false,
            errorCode: null
          };
        },
        requestEmailOtp() {
          return {
            ok: false,
            errorCode: "identity/permission-not-ready",
            retryAfterSeconds: null,
            cooldownSeconds: null
          };
        }
      };
    }
    try {
      ${block}
      const status = identityProviderConfig_diag();
      return { status, importCount, importedPaths };
    } finally {
      delete globalThis.${PROBE_MARKER};
      delete globalThis.${PRIVATE_CONFIG_GLOBAL};
    }
  `;
}

function assertSkippedBundleProbe(label, probe) {
  assert(probe && typeof probe === "object", `${label}: bundleProbe must be present`);
  assert(probe.expected === false, `${label}: bundleProbe expected must be false`);
  assert(probe.loaded === false, `${label}: bundleProbe loaded must be false`);
  assert(probe.kind === "skipped", `${label}: bundleProbe kind must be skipped`);
  assert(probe.phase === "3.0X", `${label}: bundleProbe phase must be 3.0X`);
  assert(probe.skipReason === "provider_config_inactive", `${label}: bundleProbe skipReason must be provider_config_inactive`);
  assert(probe.clientCreatedAtImport === false, `${label}: clientCreatedAtImport must be false`);
  assert(probe.smokeRun === false, `${label}: smokeRun must be false`);
  assert(probe.clientCreated === false, `${label}: clientCreated must be false`);
  assert(probe.networkObserved === false, `${label}: networkObserved must be false`);
  assert(probe.authCallsObserved === false, `${label}: authCallsObserved must be false`);
  assert(probe.otpEnabled === false, `${label}: otpEnabled must be false`);
  assert(probe.clientReady === false, `${label}: clientReady must be false`);
  assert(probe.realConfigSmokeRun === false, `${label}: realConfigSmokeRun must be false`);
  assert(probe.realConfigClientCreated === false, `${label}: realConfigClientCreated must be false`);
}

function assertLoadedBundleProbe(label, probe) {
  assert(probe && typeof probe === "object", `${label}: bundleProbe must be present`);
  assert(probe.expected === true, `${label}: bundleProbe expected must be true`);
  assert(probe.loaded === true, `${label}: bundleProbe loaded must be true`);
  assert(probe.kind === SDK_PROBE_KIND, `${label}: bundleProbe kind must be ${SDK_PROBE_KIND}`);
  assert(probe.phase === SDK_PROBE_PHASE, `${label}: bundleProbe phase must be ${SDK_PROBE_PHASE}`);
  assert(probe.skipReason === null, `${label}: loaded bundleProbe skipReason must be null`);
  assert(probe.clientCreatedAtImport === false, `${label}: clientCreatedAtImport must be false`);
  assert(probe.smokeRun === true, `${label}: smokeRun must be true`);
  assert(probe.clientCreated === true, `${label}: clientCreated must be true after lazy smoke`);
  assert(probe.networkEnabled === false, `${label}: networkEnabled must be false`);
  assert(probe.networkObserved === false, `${label}: networkObserved must be false`);
  assert(probe.authCallsObserved === false, `${label}: authCallsObserved must be false`);
  assert(probe.otpEnabled === false, `${label}: otpEnabled must be false`);
  assert(probe.realConfigSmokeAvailable === true, `${label}: realConfigSmokeAvailable must be true`);
  assert(probe.realConfigSmokeRun === true, `${label}: realConfigSmokeRun must be true`);
  assert(probe.realConfigClientCreated === true, `${label}: realConfigClientCreated must be true`);
  assert(probe.realConfigNetworkObserved === false, `${label}: realConfigNetworkObserved must be false`);
  assert(probe.realConfigAuthCallsObserved === false, `${label}: realConfigAuthCallsObserved must be false`);
  assert(probe.realConfigOtpEnabled === false, `${label}: realConfigOtpEnabled must be false`);
  assert(probe.clientReady === true, `${label}: clientReady must be true after real-config lazy client smoke`);
}

function assertNetworkArmingBlocked(label, status) {
  assert(status.phaseNetworkEnabled === false, `${label}: phaseNetworkEnabled must be false`);
  assert(status.networkReady === false, `${label}: networkReady must remain false`);
  assert(status.networkStatus === "blocked", `${label}: networkStatus must be blocked`);
  assert(status.networkBlockReason === "phase_not_enabled", `${label}: networkBlockReason must be phase_not_enabled`);
}

function assertBuiltConditionalProbePath(variant, bgSource) {
  assert(bgSource.includes("identityProviderBundle_shouldLoadProbe"), `${variant}: built bg.js must gate provider bundle loading`);
  assert(bgSource.includes("identityProviderBundle_ensureProbeLoaded"), `${variant}: built bg.js must lazy-load provider bundle through ensure helper`);
  assert(bgSource.includes('kind: "skipped"'), `${variant}: built bg.js must include skipped bundle diagnostic`);
  assert(bgSource.includes('phase: "3.0X"'), `${variant}: built bg.js must include Phase 3.0X skipped diagnostic`);
  assert(bgSource.includes('skipReason: "provider_config_inactive"'), `${variant}: built bg.js must include inactive-config skip reason`);
  assert(!bgSource.includes("}\n\nidentityProviderBundle_loadProbe();\n\nconst MODE_LIVE_FIRST"),
    `${variant}: built bg.js must not load provider bundle unconditionally at service-worker boot`);

  const defaultResult = new Function(makeBuiltProbeEvalCode(variant, bgSource, null))();
  assert(defaultResult.importCount === 0, `${variant}: default mock/no-config path must not call importScripts`);
  assert(defaultResult.importedPaths.length === 0, `${variant}: default mock/no-config path must not import provider or private config paths`);
  assert(defaultResult.status.providerKind === "mock", `${variant}: default status must stay mock`);
  assert(defaultResult.status.providerMode === "local_dev", `${variant}: default status must stay local_dev`);
  assert(defaultResult.status.configSource === "built_in_mock", `${variant}: default configSource must stay built_in_mock`);
  assert(defaultResult.status.permissionReady === false, `${variant}: default permissionReady must remain false`);
  assertNetworkArmingBlocked(`${variant} default mock/no-config`, defaultResult.status);
  assertSkippedBundleProbe(`${variant} default mock/no-config`, defaultResult.status.bundleProbe);

  const providerResult = new Function(makeBuiltProbeEvalCode(
    variant,
    bgSource,
    REDACTED_COMPLETE_DEV_ENV_STATUS,
  ))();
  assert(providerResult.importCount === 2, `${variant}: redacted complete provider config may import provider bundle and private config once each`);
  assert(providerResult.importedPaths.join(",") === `${PROVIDER_BUNDLE_REL},${PRIVATE_CONFIG_REL}`,
    `${variant}: redacted provider path must load provider bundle then private config; got ${providerResult.importedPaths.join(",")}`);
  assert(providerResult.status.providerKind === "supabase", `${variant}: redacted configured path must classify supabase readiness`);
  assert(providerResult.status.providerMode === "provider_backed", `${variant}: redacted configured path must be provider_backed`);
  assert(providerResult.status.providerConfigured === true, `${variant}: redacted configured path must be configured`);
  assert(providerResult.status.valid === true, `${variant}: redacted configured path must be valid`);
  assert(providerResult.status.permissionReady === false, `${variant}: redacted provider path must keep permissionReady false`);
  assertNetworkArmingBlocked(`${variant} redacted provider-backed`, providerResult.status);
  assert(providerResult.status.clientReady === true, `${variant}: redacted provider path must report clientReady true after private lazy smoke`);
  assertLoadedBundleProbe(`${variant} redacted provider-backed`, providerResult.status.bundleProbe);
  assertNoPatterns(`${variant} redacted provider status`, JSON.stringify(providerResult.status), [
    ["raw Supabase URL", /https:\/\/[a-z0-9-]+\.supabase\.co/i],
    ["JWT-like value", /eyJ[A-Za-z0-9_-]{40,}/],
    ["service role", /\b(service_role|service-role)\b/i],
    ["anon key label", /\banon[\s_-]*key\b/i],
  ]);
}

function pageFacingRels(root, allFiles) {
  const rels = new Set([
    "loader.js",
    "folder-bridge-page.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "surfaces/identity/identity.html",
    "surfaces/identity/identity.js",
    "surfaces/identity/identity.css",
    "scripts/0D4a.⬛️🔐 Identity Core 🔐.js",
  ]);
  for (const file of allFiles) {
    const rel = toRel(root, file);
    if (rel.startsWith("scripts/") || rel.startsWith("surfaces/")) rels.add(rel);
    if (/^popup\.(?:css|html|js)$/i.test(rel)) rels.add(rel);
  }
  return [...rels].filter((rel) => existsAbs(path.join(root, rel)));
}

function assertNoBundleLeakOutsideAllowed(root, files) {
  for (const file of files) {
    const rel = toRel(root, file);
    const source = readAbs(file);
    assert(!source.includes(LEGACY_PROVIDER_BUNDLE_REL), `${rel}: legacy provider bundle path must not remain after Phase 3.0W rename`);
    assert(!source.includes(LEGACY_PROVIDER_BUNDLE_NAME), `${rel}: legacy provider bundle name must not remain after Phase 3.0W rename`);
    const hasMarker = source.includes(PROBE_MARKER);
    const hasPath = source.includes(PROVIDER_BUNDLE_REL);
    const hasBundleName = source.includes(PROVIDER_BUNDLE_NAME);
    if (!hasMarker && !hasPath && !hasBundleName) continue;
    assert(ALLOWED_MARKER_RELS.has(rel), `${rel}: provider bundle marker/path may appear only in bg.js or ${PROVIDER_BUNDLE_REL}`);
  }
}

function assertNoSdkLeakOutsideProviderBundle(root, files) {
  for (const file of files) {
    const rel = toRel(root, file);
    if (rel === PROVIDER_BUNDLE_REL) continue;
    const source = readAbs(file);
    assert(!source.includes(SDK_PACKAGE_NAME), `${rel}: SDK package name may appear only in provider bundle output`);
    assert(!source.includes("@supabase/"), `${rel}: Supabase package namespace may appear only in provider bundle output`);
  }
}

function assertNoPageFacingBundleLeak(root, rels) {
  for (const rel of rels) {
    const source = readAbs(path.join(root, rel));
    assert(!source.includes(PROBE_MARKER), `${rel}: page-facing output must not contain provider bundle marker`);
    assert(!source.includes(PROVIDER_BUNDLE_REL), `${rel}: page-facing output must not reference provider bundle path`);
    assert(!source.includes(PROVIDER_BUNDLE_NAME), `${rel}: page-facing output must not contain provider bundle name`);
    assert(!source.includes(LEGACY_PROVIDER_BUNDLE_REL), `${rel}: page-facing output must not reference legacy provider bundle path`);
    assert(!source.includes(LEGACY_PROVIDER_BUNDLE_NAME), `${rel}: page-facing output must not contain legacy provider bundle name`);
    assertNoPatterns(rel, source, PROVIDER_AND_TOKEN_PATTERNS);
  }
}

function assertNoAccidentalBundleCopies(root, allFiles) {
  const providerLike = allFiles
    .map((file) => toRel(root, file))
    .filter((rel) => rel.includes(PROVIDER_BUNDLE_NAME)
      || rel.endsWith(PROVIDER_BUNDLE_REL)
      || rel.includes(LEGACY_PROVIDER_BUNDLE_NAME)
      || rel.endsWith(LEGACY_PROVIDER_BUNDLE_REL));
  assert(providerLike.length === 1 && providerLike[0] === PROVIDER_BUNDLE_REL,
    `provider bundle must exist only at ${PROVIDER_BUNDLE_REL}; found ${providerLike.join(", ") || "none"}`);
}

function validateVariant(variant) {
  const baseRel = `build/${variant}`;
  const root = path.join(REPO_ROOT, baseRel);
  assert(exists(baseRel), `${variant}: build output exists`);

  const manifest = readJson(`${baseRel}/manifest.json`);
  const allFiles = listFiles(root);
  const generatedTextFiles = textFiles(root);
  const builtBg = read(`${baseRel}/bg.js`);
  const builtLoader = read(`${baseRel}/loader.js`);
  const providerBundle = read(`${baseRel}/${PROVIDER_BUNDLE_REL}`);

  const privateConfigPresent = existsAbs(path.join(root, PRIVATE_CONFIG_REL));
  if (privateConfigPresent) {
    assert(variant !== "chrome-ext-prod",
      `${variant}: private config artifact must remain absent in production output`);
  }
  assertNoAccidentalBundleCopies(root, allFiles);
  assertProviderBundleOutputSafe(`${variant} provider bundle`, providerBundle);

  assert(builtBg.includes(PROVIDER_BUNDLE_REL), `${variant}: built bg.js references provider bundle path`);
  assert(!builtBg.includes(LEGACY_PROVIDER_BUNDLE_REL), `${variant}: built bg.js must not reference legacy provider bundle path`);
  assert(!builtBg.includes(LEGACY_PROVIDER_BUNDLE_NAME), `${variant}: built bg.js must not reference legacy provider bundle name`);
  assert(builtBg.includes("identityProviderBundle_loadProbe"), `${variant}: built bg.js contains probe loader`);
  assert(builtBg.includes("importScripts(IDENTITY_PROVIDER_BUNDLE_PATH)"), `${variant}: built bg.js retains conditional importScripts path`);
  assertBuiltConditionalProbePath(variant, builtBg);
  assertBuiltOnboardingDirectSessionFixture(variant, builtBg);
  assert(builtBg.includes("identityProviderBundle_sanitizeSdkImport"), `${variant}: built bg.js sanitizes SDK import probe metadata`);
  assert(builtBg.includes("identityProviderBundle_sanitizeAdapter"), `${variant}: built bg.js sanitizes adapter probe metadata`);
  assert(builtBg.includes("identityProviderBundle_sanitizeClientSmoke"), `${variant}: built bg.js sanitizes lazy client smoke metadata`);
  assert(builtBg.includes("identityProviderBundle_runClientSmoke"), `${variant}: built bg.js has lazy client smoke runner`);
  assert(builtBg.includes("identityProviderBundleProbeState.clientSmoke.smokeRun === true"),
    `${variant}: built bg.js must only skip lazy client smoke after smokeRun is true`);
  assert(builtBg.includes("identityProviderBundle_getProbeStatus"), `${variant}: built bg.js contains safe probe status helper`);
  assert(builtBg.includes("bundleProbe"), `${variant}: built bg.js exposes safe bundleProbe diagnostic`);
  assert(builtBg.includes("supportedPlannedOps"), `${variant}: built bg.js exposes sanitized planned ops only`);
  assert(builtBg.includes("clientCreatedAtImport"), `${variant}: built bg.js exposes clientCreatedAtImport diagnostic only`);
  assert(builtBg.includes("networkObserved"), `${variant}: built bg.js exposes networkObserved diagnostic only`);
  assert(builtBg.includes("authCallsObserved"), `${variant}: built bg.js exposes authCallsObserved diagnostic only`);
  assert(builtBg.includes(`package: "${SDK_DIAG_PACKAGE}"`), `${variant}: built bg.js exposes only generic SDK diagnostic package label`);
  assert(!builtBg.includes(SDK_PACKAGE_NAME), `${variant}: built bg.js must not expose raw SDK package name`);
  assert(!builtLoader.includes(PROBE_MARKER), `${variant}: loader.js must not contain provider bundle marker`);

  const warResources = flattenWarResources(manifest);
  const warJson = JSON.stringify(warResources);
  assert(!warResources.includes(PROVIDER_BUNDLE_REL), `${variant}: provider bundle must not be web-accessible`);
  assert(!warResources.includes(PRIVATE_CONFIG_REL), `${variant}: private config artifact must not be web-accessible`);
  assert(!warResources.some((resource) => String(resource || "").startsWith("provider/")),
    `${variant}: provider directory must not be web-accessible`);
  assert(!warJson.includes(PROVIDER_BUNDLE_NAME), `${variant}: no provider bundle in web_accessible_resources`);
  assert(!warJson.includes(LEGACY_PROVIDER_BUNDLE_NAME), `${variant}: no legacy provider bundle in web_accessible_resources`);
  assert(!warJson.includes(PROBE_MARKER), `${variant}: no provider marker in web_accessible_resources`);

  assertNoBundleLeakOutsideAllowed(root, generatedTextFiles);
  assertNoSdkLeakOutsideProviderBundle(root, generatedTextFiles);
  assertNoPageFacingBundleLeak(root, pageFacingRels(root, allFiles));

  assertScriptParses(`${variant} bg.js`, builtBg);
  assertScriptParses(`${variant} loader.js`, builtLoader);
  assertScriptParses(`${variant} folder-bridge-page.js`, read(`${baseRel}/folder-bridge-page.js`));
  assertScriptParses(`${variant} provider bundle`, providerBundle);
  assertScriptParses(`${variant} identity surface`, read(`${baseRel}/surfaces/identity/identity.js`));
  assertScriptParses(`${variant} Identity Core`, read(`${baseRel}/scripts/0D4a.⬛️🔐 Identity Core 🔐.js`));
  if (exists(`${baseRel}/popup.js`)) assertScriptParses(`${variant} popup.js`, read(`${baseRel}/popup.js`));

  console.log(`  ${variant}: generated output isolation hardened ✓`);
}

function assertRawRealConfigSmokeValuesOnlyInPrivateConfig(root, label, expectPrivateConfig) {
  const allFiles = textFiles(root);
  const privatePath = path.join(root, PRIVATE_CONFIG_REL);
  assert(existsAbs(privatePath) === expectPrivateConfig,
    `${label}: private config artifact presence mismatch`);
  for (const file of allFiles) {
    const rel = toRel(root, file);
    const source = readAbs(file);
    const hasProject = source.includes(REAL_CONFIG_SMOKE_PROVIDER_URL);
    const hasPublicClient = source.includes(REAL_CONFIG_SMOKE_PUBLIC_CLIENT);
    if (!hasProject && !hasPublicClient) continue;
    assert(expectPrivateConfig && rel === PRIVATE_CONFIG_REL,
      `${label} ${rel}: raw validator config value may appear only in ${PRIVATE_CONFIG_REL}`);
  }
}

function validateDevOnlyPrivateConfigBuildSimulation() {
  const devOut = path.join("/tmp", `h2o-phase3y-dev-${process.pid}`);
  const prodOut = path.join("/tmp", `h2o-phase3y-prod-${process.pid}`);
  const commonEnv = {
    ...process.env,
    H2O_IDENTITY_PROVIDER_KIND: "supabase",
    H2O_IDENTITY_PROVIDER_PROJECT_URL: REAL_CONFIG_SMOKE_PROVIDER_URL,
    H2O_IDENTITY_PROVIDER_PUBLIC_CLIENT: REAL_CONFIG_SMOKE_PUBLIC_CLIENT,
  };
  fs.rmSync(devOut, { recursive: true, force: true });
  fs.rmSync(prodOut, { recursive: true, force: true });
  try {
    execFileSync(process.execPath, ["tools/product/extension/build-chrome-live-extension.mjs"], {
      cwd: REPO_ROOT,
      env: {
        ...commonEnv,
        H2O_EXT_OUT_DIR: devOut,
      },
      stdio: "pipe",
    });
    assertRawRealConfigSmokeValuesOnlyInPrivateConfig(devOut, "validator dev config simulation", true);
    const devManifest = JSON.parse(readAbs(path.join(devOut, "manifest.json")));
    assert(!flattenWarResources(devManifest).includes(PRIVATE_CONFIG_REL),
      "validator dev config simulation: private config artifact must not be web-accessible");
    assert(!flattenWarResources(devManifest).some((resource) => String(resource || "").startsWith("provider/")),
      "validator dev config simulation: provider directory must not be web-accessible");

    execFileSync(process.execPath, ["tools/product/extension/build-chrome-live-extension.mjs"], {
      cwd: REPO_ROOT,
      env: {
        ...commonEnv,
        H2O_EXT_DEV_VARIANT: "production",
        H2O_EXT_OUT_DIR: prodOut,
      },
      stdio: "pipe",
    });
    assertRawRealConfigSmokeValuesOnlyInPrivateConfig(prodOut, "validator production config simulation", false);
    const prodManifest = JSON.parse(readAbs(path.join(prodOut, "manifest.json")));
    assert(!flattenWarResources(prodManifest).includes(PRIVATE_CONFIG_REL),
      "validator production config simulation: private config artifact must not be web-accessible");
    assert(stringList(prodManifest.host_permissions).join(",") === "https://chatgpt.com/*",
      "validator production config simulation: production host permissions must remain narrow");
  } finally {
    fs.rmSync(devOut, { recursive: true, force: true });
    fs.rmSync(prodOut, { recursive: true, force: true });
  }
}

console.log("\n── Identity Phase 3.0X/3.0Y conditional provider bundle and real-config readiness validation ───");

const packageJson = readJson("package.json");
const lockJson = readJson("package-lock.json");

assert(packageJson.devDependencies?.esbuild, "package.json includes approved esbuild devDependency");
assert(packageJson.dependencies?.[SDK_PACKAGE_NAME], "package.json includes approved provider SDK dependency");
assert(!packageJson.devDependencies?.[SDK_PACKAGE_NAME], "provider SDK must not be a devDependency");
const packageProviderDeps = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
].filter((name) => name.startsWith("@supabase/"));
assert(packageProviderDeps.length === 1 && packageProviderDeps[0] === SDK_PACKAGE_NAME,
  `package.json must list only ${SDK_PACKAGE_NAME} as a direct provider dependency`);
assert(lockJson.packages?.["node_modules/esbuild"], "package-lock.json includes esbuild package");
assert(lockJson.packages?.[`node_modules/${SDK_PACKAGE_NAME}`], "package-lock.json includes approved provider SDK package");
console.log("  package scope includes only approved direct provider SDK dependency ✓");

assert(exists(SOURCE_ENTRY_REL), "provider bundle entry exists");
assert(!exists(`tools/product/identity/${LEGACY_PROVIDER_BUNDLE_NAME}.entry.mjs`), "legacy provider bundle entry must be renamed");
assert(exists("tools/product/identity/build-identity-provider-bundle.mjs"), "provider bundle build helper exists");
assertProviderSourceSafe("provider bundle source entry", read(SOURCE_ENTRY_REL));
console.log("  provider source imports SDK only for lazy client smoke metadata ✓");

const buildScript = read("tools/product/extension/build-chrome-live-extension.mjs");
assert(buildScript.includes("buildIdentityProviderBundle"), "extension build invokes provider bundle build helper");
assert(buildScript.includes("IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH"), "extension build passes provider bundle path to background generator");
console.log("  extension build still wires background-owned bundle artifact ✓");

const bgSrc = read("tools/product/extension/chrome-live-background.mjs");
assert(bgSrc.includes("identityProviderBundle_loadProbe"), "background source has bundle probe loader");
assert(bgSrc.includes("importScripts(IDENTITY_PROVIDER_BUNDLE_PATH)"), "background source retains conditional importScripts path");
assert(bgSrc.includes("identityProviderBundle_shouldLoadProbe"), "background source gates provider bundle loading on redacted injected config");
assert(bgSrc.includes("identityProviderBundle_ensureProbeLoaded"), "background source lazy-loads provider bundle through ensure helper");
assert(bgSrc.includes('skipReason: "provider_config_inactive"'), "background source reports inactive provider config skip reason");
assert(!bgSrc.includes("}\n\nidentityProviderBundle_loadProbe();\n\nconst MODE_LIVE_FIRST"),
  "background source must not load provider bundle unconditionally at service-worker boot");
assert(bgSrc.includes("identityProviderBundle_getProbeStatus"), "background source exposes safe bundle probe status");
assert(bgSrc.includes("bundleProbe"), "providerConfigStatus includes bundleProbe");
assert(bgSrc.includes("identityProviderBundleProbeState.clientSmoke.smokeRun === true"),
  "background source must not skip lazy client smoke just because import-time metadata exists");
assertBackgroundOnboardingSessionBoundary();
console.log("  background source conditionally loads provider bundle and exposes safe probe status only ✓");

for (const variant of VARIANTS) validateVariant(variant);
validateDevOnlyPrivateConfigBuildSimulation();
console.log("  dev-only private config artifact simulation passed ✓");

console.log(`  allowed bundle locations confirmed: bg.js and ${PROVIDER_BUNDLE_REL} ✓`);
console.log("  forbidden page-facing locations confirmed clean ✓");
console.log("\nIdentity Phase 3.0X/3.0Y conditional provider bundle and real-config readiness validation PASSED ✓\n");
