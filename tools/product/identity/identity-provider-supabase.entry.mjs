import * as ProviderSdk from "@supabase/supabase-js";

const SMOKE_PROVIDER_URL = "https://h2o-provider-client-smoke.invalid";
const SMOKE_PUBLIC_CLIENT = "provider-client-smoke";

const sdkExportCount = Object.keys(ProviderSdk || {}).length;
const clientSmokeState = {
  smokeRun: false,
  clientCreated: false,
  networkObserved: false,
  authCallsObserved: false,
  errorCode: null,
};
const realConfigSmokeState = {
  smokeRun: false,
  clientCreated: false,
  networkObserved: false,
  authCallsObserved: false,
  errorCode: null,
};
const PROVIDER_SIGN_OUT_TIMEOUT_MS = 5000;
const PROVIDER_SIGN_OUT_STORAGE_KEY = "h2o-identity-provider-signout-v1";
const PROVIDER_OAUTH_STORAGE_KEY = "h2o-identity-provider-oauth-v1";
const PROVIDER_SIGN_OUT_EXPIRY_SKEW_MS = 120 * 1000;

function normalizeProviderEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}

function clientSmokeStatus() {
  return Object.freeze({
    clientSmokeAvailable: typeof ProviderSdk.createClient === "function",
    clientCreatedAtImport: false,
    clientCreated: clientSmokeState.clientCreated === true,
    networkEnabled: false,
    networkObserved: clientSmokeState.networkObserved === true,
    authCallsObserved: clientSmokeState.authCallsObserved === true,
    otpEnabled: false,
    smokeRun: clientSmokeState.smokeRun === true,
    errorCode: clientSmokeState.errorCode || null,
  });
}

function guardedSmokeFetch() {
  clientSmokeState.networkObserved = true;
  throw new Error("identity-provider-client-smoke-network-blocked");
}

function realConfigSmokeStatus() {
  return Object.freeze({
    realConfigSmokeAvailable: typeof ProviderSdk.createClient === "function",
    realConfigSmokeRun: realConfigSmokeState.smokeRun === true,
    realConfigClientCreated: realConfigSmokeState.clientCreated === true,
    realConfigNetworkObserved: realConfigSmokeState.networkObserved === true,
    realConfigAuthCallsObserved: realConfigSmokeState.authCallsObserved === true,
    realConfigOtpEnabled: false,
    errorCode: realConfigSmokeState.errorCode || null,
  });
}

function guardedRealConfigFetch() {
  realConfigSmokeState.networkObserved = true;
  throw new Error("identity-provider-real-config-smoke-network-blocked");
}

function normalizeRealConfigSmokeInput(config) {
  const src = config && typeof config === "object" ? config : {};
  const projectUrl = String(src.projectUrl || "").trim();
  const publicClient = String(src.publicClient || "").trim();
  if (!projectUrl || !publicClient) return null;
  try {
    const parsed = new URL(projectUrl);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { projectUrl, publicClient };
}

function normalizeProviderRetrySeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return null;
  return Math.floor(seconds);
}

function normalizeProviderOtpCode(input) {
  const code = String(input || "").trim();
  return /^[0-9]{6,10}$/.test(code) ? code : "";
}

function normalizeProviderPassword(input) {
  const password = typeof input === "string" ? input : "";
  if (password.length < 6 || password.length > 1024) return "";
  return password;
}

function normalizeProviderOAuthProvider(input) {
  const value = String(input || "").trim().toLowerCase();
  return value === "google" ? "google" : "";
}

function normalizeProviderOAuthRedirectTo(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") return "";
    if (!/^[a-z0-9-]+\.chromiumapp\.org$/i.test(parsed.hostname)) return "";
    if (parsed.pathname !== "/identity/oauth/google") return "";
    if (parsed.username || parsed.password || parsed.hash) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeProviderOAuthCallbackUrl(input, expectedRedirectTo = "") {
  const expected = normalizeProviderOAuthRedirectTo(expectedRedirectTo);
  const text = String(input || "").trim();
  if (!expected || !text) return "";
  try {
    const parsed = new URL(text);
    const expectedUrl = new URL(expected);
    if (parsed.origin !== expectedUrl.origin || parsed.pathname !== expectedUrl.pathname) return "";
    if (parsed.hash && /access_token|refresh_token|provider_token/i.test(parsed.hash)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function providerOtpFetch(...args) {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("identity-provider-fetch-unavailable");
  }
  return fetchImpl(...args);
}

function mapProviderOtpError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return "identity/provider-rate-limited";
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (/not found|not exist|no account|user.*missing|user.*not|signup|signups|create user|social login/.test(message)) {
    return "identity/account-not-found";
  }
  if (status === 400 || status === 401 || status === 403 || /invalid|rejected|not allowed|forbidden/.test(message)) {
    return "identity/provider-rejected";
  }
  return error ? "identity/provider-request-failed" : "identity/unknown-provider-error";
}

function mapProviderVerifyError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/network-failed";
  if (/expired|expire/.test(message)) return "identity/otp-expired";
  if (status === 400 || status === 401 || /invalid|token|otp|code/.test(message)) return "identity/otp-invalid";
  if (status === 403 || /rejected|not allowed|forbidden/.test(message)) return "identity/provider-rejected";
  return error ? "identity/provider-rejected" : "identity/unknown-provider-error";
}

function mapProviderPasswordError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return "identity/provider-rate-limited";
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (/weak|password should be|at least|minimum|short/.test(message)) return "identity/password-weak";
  if (/not confirmed|confirm|email.*verified|email.*confirmation/.test(message)) return "identity/email-not-confirmed";
  if (/already.*registered|already.*exists|user.*exists|email.*exists|duplicate/.test(message)) {
    return "identity/account-already-exists";
  }
  if (status === 400 || status === 401 || /invalid login|invalid credentials|email or password|password/.test(message)) {
    return "identity/password-invalid";
  }
  if (status === 403 || /rejected|not allowed|forbidden/.test(message)) return "identity/provider-rejected";
  return error ? "identity/provider-rejected" : "identity/unknown-provider-error";
}

function mapProviderPasswordResetError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return "identity/provider-rate-limited";
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (status === 400 || status === 401 || status === 403 || /invalid|rejected|not allowed|forbidden/.test(message)) {
    return "identity/provider-rejected";
  }
  return error ? "identity/provider-request-failed" : "identity/unknown-provider-error";
}

function mapProviderPasswordUpdateError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return "identity/provider-rate-limited";
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (/weak|password should be|at least|minimum|short/.test(message)) return "identity/password-weak";
  if (/current password|invalid.*password|password.*incorrect|wrong password|credentials/.test(message)) {
    return "identity/password-current-invalid";
  }
  if (/recent|reauth|nonce|current password|same password/.test(message)) {
    return "identity/password-update-requires-recent-code";
  }
  if (status === 400 || status === 401 || /session|jwt|token|auth/.test(message)) {
    return "identity/password-update-session-missing";
  }
  if (status === 403 || /rejected|not allowed|forbidden/.test(message)) return "identity/provider-rejected";
  return error ? "identity/password-update-failed" : "identity/unknown-provider-error";
}

function mapProviderOAuthError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || src.error_description || src.error || "").toLowerCase();
  if (/access_denied|cancel|dismiss|closed/.test(message)) return "identity/oauth-cancelled";
  if (/redirect|callback|code verifier|pkce|code/.test(message)) return "identity/oauth-callback-invalid";
  if (/provider.*disabled|unsupported|not enabled/.test(message)) return "identity/oauth-provider-unavailable";
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (status === 400 || status === 401 || /invalid|rejected/.test(message)) return "identity/oauth-exchange-failed";
  if (status === 403 || /forbidden|not allowed/.test(message)) return "identity/provider-rejected";
  return error ? "identity/oauth-failed" : "identity/unknown-provider-error";
}

function mapProviderRefreshError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (status === 400 || status === 401 || /invalid|refresh|token|jwt|session/.test(message)) {
    return "identity/session-refresh-failed";
  }
  if (status === 403 || /rejected|not allowed|forbidden/.test(message)) return "identity/provider-rejected";
  return error ? "identity/session-refresh-failed" : "identity/unknown-provider-error";
}

function mapProviderSignOutError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const name = String(src.name || "").toLowerCase();
  const message = String(src.message || "").toLowerCase();
  if (name === "aborterror" || /abort|timeout|fetch|network|failed to fetch/.test(message)) {
    return "identity/provider-network-failed";
  }
  if (status === 400 || status === 401 || status === 403 || /invalid|session|token|jwt|rejected|forbidden/.test(message)) {
    return "identity/provider-sign-out-failed";
  }
  return error ? "identity/provider-sign-out-failed" : "identity/unknown-provider-error";
}

function mapProviderOnboardingError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const code = String(src.code || "").toLowerCase();
  const message = String(src.message || src.details || "").toLowerCase();
  if (/fetch|network|timeout|failed to fetch|connection/.test(message)) return "identity/onboarding-network-failed";
  if (status === 409 || code === "23505" || /conflict|duplicate|unique/.test(message)) return "identity/onboarding-conflict";
  if (status === 400 || code === "22023" || /invalid|check constraint|constraint/.test(message)) return "identity/onboarding-rejected";
  if (status === 401 || status === 403 || code === "42501" || /permission|forbidden|rls|row-level|row level|rejected/.test(message)) {
    return "identity/onboarding-rejected";
  }
  return error ? "identity/onboarding-failed" : "identity/onboarding-provider-unavailable";
}

function mapProviderAccountUpdateError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const code = String(src.code || "").toLowerCase();
  const message = String(src.message || src.details || "").toLowerCase();
  if (/fetch|network|timeout|failed to fetch|connection/.test(message)) return "identity/account-update-network-failed";
  if (status === 400 || code === "22023" || /invalid|check constraint|constraint/.test(message)) return "identity/account-update-invalid-input";
  if (status === 401 || status === 403 || code === "42501" || /permission|forbidden|rls|row-level|row level|rejected/.test(message)) {
    return "identity/account-update-rejected";
  }
  if (code === "p0002" || /not found|missing/.test(message)) return "identity/account-update-not-found";
  return error ? "identity/account-update-failed" : "identity/account-update-provider-unavailable";
}

function mapProviderIdentityLoadError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const code = String(src.code || "").toLowerCase();
  const message = String(src.message || src.details || "").toLowerCase();
  if (/fetch|network|timeout|failed to fetch|connection/.test(message)) return "identity/cloud-load-network-failed";
  if (status === 401 || status === 403 || code === "42501" || /permission|forbidden|rls|row-level|row level|rejected/.test(message)) {
    return "identity/cloud-load-rejected";
  }
  return error ? "identity/cloud-load-failed" : "identity/cloud-load-provider-unavailable";
}

function normalizeProviderSessionExpiresAt(value) {
  if (typeof value === "string" && value) return value;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(Math.floor(seconds) * 1000).toISOString();
  }
  return null;
}

function maskProviderUserId(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 10) return text.slice(0, 2) + "***";
  return text.slice(0, 6) + "***" + text.slice(-4);
}

function normalizeProviderRefreshToken(input) {
  const token = String(input || "").trim();
  if (!token || token.length > 8192 || /[\s<>]/.test(token)) return "";
  return token;
}

function normalizeProviderAccessToken(input) {
  const token = String(input || "").trim();
  if (!token || token.length > 16384 || /[\s<>]/.test(token)) return "";
  return token;
}

function providerSessionExpiryMs(session) {
  const raw = session && typeof session === "object"
    ? (session.expires_at ?? session.sessionExpiresAt ?? session.expiresAt)
    : null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw) * 1000;
  const text = String(raw || "").trim();
  if (!text) return 0;
  if (/^[0-9]+$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) * 1000 : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeProviderSignOutSession(input) {
  const src = input && typeof input === "object" ? input : null;
  if (!src) return null;
  const accessToken = normalizeProviderAccessToken(src.access_token);
  const refreshToken = normalizeProviderRefreshToken(src.refresh_token);
  const expiresMs = providerSessionExpiryMs(src);
  if (!accessToken || !refreshToken || !expiresMs) return null;
  if (expiresMs <= Date.now() + PROVIDER_SIGN_OUT_EXPIRY_SKEW_MS) return null;
  return {
    ...src,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(expiresMs / 1000),
  };
}

function normalizeProviderSessionForInternalStorage(rawSession, rawUser, fallbackEmail = "") {
  const session = rawSession && typeof rawSession === "object" ? rawSession : null;
  const sourceUser = rawUser && typeof rawUser === "object"
    ? rawUser
    : (session && session.user && typeof session.user === "object" ? session.user : null);
  if (!session || !sourceUser) return null;
  const accessToken = normalizeProviderAccessToken(session.access_token);
  const refreshToken = normalizeProviderRefreshToken(session.refresh_token || session.refreshToken);
  const email = normalizeProviderEmail(sourceUser.email) || normalizeProviderEmail(fallbackEmail);
  const id = String(sourceUser.id || "").trim();
  const expiresMs = providerSessionExpiryMs(session);
  if (!accessToken || !email || !id || !expiresMs) return null;
  const {
    provider_token,
    provider_refresh_token,
    providerToken,
    providerRefreshToken,
    provider_id_token,
    providerIdToken,
    ...sessionWithoutProviderTokens
  } = session;
  return {
    ...sessionWithoutProviderTokens,
    access_token: accessToken,
    refresh_token: refreshToken || session.refresh_token,
    expires_at: Math.floor(expiresMs / 1000),
    user: {
      ...sourceUser,
      id,
      email,
    },
  };
}

function normalizeProviderOnboardingInput(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const displayName = String(src.displayName || "").trim();
  const avatarColor = String(src.avatarColor || "").trim();
  const workspaceName = String(src.workspaceName || "").trim();
  if (displayName.length < 1 || displayName.length > 64) return null;
  if (workspaceName.length < 1 || workspaceName.length > 64) return null;
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(avatarColor)) return null;
  return { displayName, avatarColor, workspaceName };
}

function normalizeProviderProfileUpdateInput(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const displayName = String(src.displayName || "").trim();
  const avatarColor = String(src.avatarColor || "").trim();
  if (displayName.length < 1 || displayName.length > 64) return null;
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(avatarColor)) return null;
  return { displayName, avatarColor };
}

function normalizeProviderWorkspaceRenameInput(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const workspaceName = String(src.workspaceName || "").trim();
  if (workspaceName.length < 1 || workspaceName.length > 64) return null;
  return { workspaceName };
}

function normalizeProviderTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeProviderId(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

function normalizeProviderOnboardingResult(data) {
  const src = data && typeof data === "object" ? data : null;
  const profile = src && src.profile && typeof src.profile === "object" ? src.profile : null;
  const workspace = src && src.workspace && typeof src.workspace === "object" ? src.workspace : null;
  const role = String(src && src.role || "").trim();
  const safeProfile = profile ? {
    id: normalizeProviderId(profile.id),
    displayName: String(profile.display_name || "").trim(),
    avatarColor: String(profile.avatar_color || "").trim(),
    onboardingCompleted: profile.onboarding_completed === true,
    createdAt: normalizeProviderTimestamp(profile.created_at),
    updatedAt: normalizeProviderTimestamp(profile.updated_at),
  } : null;
  const safeWorkspace = workspace ? {
    id: normalizeProviderId(workspace.id),
    name: String(workspace.name || "").trim(),
    role: role === "owner" ? "owner" : "",
    createdAt: normalizeProviderTimestamp(workspace.created_at),
    updatedAt: normalizeProviderTimestamp(workspace.updated_at),
  } : null;
  if (!safeProfile
    || !safeWorkspace
    || !safeProfile.id
    || safeProfile.displayName.length < 1
    || safeProfile.displayName.length > 64
    || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(safeProfile.avatarColor)
    || safeProfile.onboardingCompleted !== true
    || !safeProfile.createdAt
    || !safeProfile.updatedAt
    || !safeWorkspace.id
    || safeWorkspace.name.length < 1
    || safeWorkspace.name.length > 64
    || safeWorkspace.role !== "owner"
    || !safeWorkspace.createdAt
    || !safeWorkspace.updatedAt) {
    return null;
  }
  return { profile: safeProfile, workspace: safeWorkspace };
}

function normalizeProviderProfileUpdateResult(data) {
  const src = data && typeof data === "object" ? data : null;
  const profile = src && src.profile && typeof src.profile === "object" ? src.profile : null;
  const safeProfile = profile ? {
    id: normalizeProviderId(profile.id),
    displayName: String(profile.display_name || "").trim(),
    avatarColor: String(profile.avatar_color || "").trim(),
    onboardingCompleted: profile.onboarding_completed === true,
    createdAt: normalizeProviderTimestamp(profile.created_at),
    updatedAt: normalizeProviderTimestamp(profile.updated_at),
  } : null;
  if (!safeProfile
    || !safeProfile.id
    || safeProfile.displayName.length < 1
    || safeProfile.displayName.length > 64
    || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(safeProfile.avatarColor)
    || safeProfile.onboardingCompleted !== true
    || !safeProfile.createdAt
    || !safeProfile.updatedAt) {
    return null;
  }
  return { profile: safeProfile };
}

function normalizeProviderWorkspaceRenameResult(data) {
  const src = data && typeof data === "object" ? data : null;
  const workspace = src && src.workspace && typeof src.workspace === "object" ? src.workspace : null;
  const role = String(src && src.role || "").trim();
  const safeWorkspace = workspace ? {
    id: normalizeProviderId(workspace.id),
    name: String(workspace.name || "").trim(),
    role: role === "owner" ? "owner" : "",
    createdAt: normalizeProviderTimestamp(workspace.created_at),
    updatedAt: normalizeProviderTimestamp(workspace.updated_at),
  } : null;
  if (!safeWorkspace
    || !safeWorkspace.id
    || safeWorkspace.name.length < 1
    || safeWorkspace.name.length > 64
    || safeWorkspace.role !== "owner"
    || !safeWorkspace.createdAt
    || !safeWorkspace.updatedAt) {
    return null;
  }
  return { workspace: safeWorkspace };
}

function normalizeProviderIdentityStateResult(data) {
  const src = data && typeof data === "object" ? data : null;
  if (!src) return null;
  const profile = src.profile && typeof src.profile === "object" ? src.profile : null;
  const workspace = src.workspace && typeof src.workspace === "object" ? src.workspace : null;
  const role = String(src.role || "").trim();
  const credentialState = normalizeProviderCredentialState(src.credential_state || src.credentialState);
  const credentialProvider = normalizeProviderCredentialProvider(src.credential_provider || src.credentialProvider);
  if (!profile && !workspace && !role) {
    return { profile: null, workspace: null, complete: false, credentialState, credentialProvider };
  }
  const safe = normalizeProviderOnboardingResult({
    profile,
    workspace,
    role,
  });
  if (!safe) return { profile: null, workspace: null, complete: false, credentialState, credentialProvider };
  return { ...safe, complete: true, credentialState, credentialProvider };
}

function normalizeProviderCredentialState(input) {
  const value = String(input || "").trim().toLowerCase();
  if (value === "complete" || value === "required" || value === "unknown") return value;
  return "unknown";
}

function normalizeProviderCredentialProvider(input) {
  const value = String(input || "").trim().toLowerCase();
  if (value === "password" || value === "google" || value === "multiple" || value === "unknown") return value;
  return "unknown";
}

function mapProviderCredentialStatusError(error) {
  const src = error && typeof error === "object" ? error : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || "").toLowerCase();
  if (/fetch|network|timeout|failed to fetch/.test(message)) return "identity/provider-network-failed";
  if (status === 400 || /invalid/.test(message)) return "identity/credential-status-invalid-source";
  if (status === 401 || status === 403 || /auth|jwt|token|forbidden|permission/.test(message)) {
    return "identity/credential-status-session-missing";
  }
  return error ? "identity/credential-status-update-failed" : "identity/unknown-provider-error";
}

function createEphemeralProviderStorage(seedSession) {
  const items = Object.create(null);
  items[PROVIDER_SIGN_OUT_STORAGE_KEY] = JSON.stringify(seedSession);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null;
    },
    setItem(key, value) {
      items[key] = String(value);
    },
    removeItem(key) {
      delete items[key];
    },
  };
}

function sanitizeOAuthStorageSnapshot(items) {
  const src = items && typeof items === "object" ? items : {};
  const clean = {};
  for (const [rawKey, rawValue] of Object.entries(src)) {
    const key = String(rawKey || "").trim();
    const value = String(rawValue || "");
    if (!key || key.length > 256 || value.length > 8192) continue;
    if (/(?:access|refresh|id|provider)[_-]?token|provider[_-]?refresh[_-]?token|session|user|email|password|secret/i.test(key)) continue;
    if (/(?:access|refresh|id|provider)[_-]?token|provider[_-]?refresh[_-]?token|password|secret/i.test(value)) continue;
    clean[key] = value;
  }
  return clean;
}

function createOAuthFlowStorage(seed = null) {
  const items = Object.create(null);
  const src = seed && typeof seed === "object" ? seed : {};
  for (const [key, value] of Object.entries(src)) {
    items[String(key)] = String(value);
  }
  const api = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null;
    },
    setItem(key, value) {
      items[String(key)] = String(value);
    },
    removeItem(key) {
      delete items[String(key)];
    },
    snapshot() {
      return sanitizeOAuthStorageSnapshot(items);
    },
  };
  return api;
}

function providerSignOutFetch(...args) {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("identity-provider-fetch-unavailable");
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
      try { controller.abort(); } catch {}
    }, PROVIDER_SIGN_OUT_TIMEOUT_MS)
    : null;
  const input = args[0];
  const init = args[1] && typeof args[1] === "object" ? { ...args[1] } : {};
  if (controller) init.signal = controller.signal;
  return Promise.resolve(fetchImpl(input, init)).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function runClientSmoke() {
  if (clientSmokeState.smokeRun) return clientSmokeStatus();
  clientSmokeState.smokeRun = true;
  try {
    const client = ProviderSdk.createClient(SMOKE_PROVIDER_URL, SMOKE_PUBLIC_CLIENT, {
      global: {
        fetch: guardedSmokeFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    clientSmokeState.clientCreated = Boolean(client);
  } catch (_) {
    clientSmokeState.errorCode = "client_create_failed";
    clientSmokeState.clientCreated = false;
  }
  return clientSmokeStatus();
}

function runRealConfigClientSmoke(config) {
  if (realConfigSmokeState.smokeRun) return realConfigSmokeStatus();
  realConfigSmokeState.smokeRun = true;
  const safeConfig = normalizeRealConfigSmokeInput(config);
  if (!safeConfig) {
    realConfigSmokeState.errorCode = "real_config_missing";
    realConfigSmokeState.clientCreated = false;
    return realConfigSmokeStatus();
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: guardedRealConfigFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    realConfigSmokeState.clientCreated = Boolean(client);
  } catch (_) {
    realConfigSmokeState.errorCode = "real_config_client_create_failed";
    realConfigSmokeState.clientCreated = false;
  }
  return realConfigSmokeStatus();
}

async function requestEmailOtp(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  if (!email) {
    return {
      ok: false,
      errorCode: "identity/invalid-email",
      retryAfterSeconds: null,
      cooldownSeconds: null,
    };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return {
      ok: false,
      errorCode: "identity/provider-auth-unavailable",
      retryAfterSeconds: null,
      cooldownSeconds: null,
    };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.signInWithOtp !== "function") {
      return {
        ok: false,
        errorCode: "identity/provider-auth-unavailable",
        retryAfterSeconds: null,
        cooldownSeconds: null,
      };
    }
    const result = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
    if (result && result.error) {
      const retryAfterSeconds = normalizeProviderRetrySeconds(
        result.error.retryAfterSeconds || result.error.retryAfter || result.error.cooldownSeconds
      );
      return {
        ok: false,
        errorCode: mapProviderOtpError(result.error),
        retryAfterSeconds,
        cooldownSeconds: retryAfterSeconds,
      };
    }
    return {
      ok: true,
      retryAfterSeconds: null,
      cooldownSeconds: null,
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: mapProviderOtpError(error),
      retryAfterSeconds: null,
      cooldownSeconds: null,
    };
  }
}

async function verifyEmailOtp(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  const code = normalizeProviderOtpCode(input.code);
  if (!email || !code) {
    return {
      ok: false,
      errorCode: "identity/invalid-otp-code",
    };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return {
      ok: false,
      errorCode: "identity/provider-unavailable",
    };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.verifyOtp !== "function") {
      return {
        ok: false,
        errorCode: "identity/provider-unavailable",
      };
    }
    const result = await client.auth.verifyOtp({ email, token: code, type: "email" });
    if (result && result.error) {
      return {
        ok: false,
        errorCode: mapProviderVerifyError(result.error),
      };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : {};
    const rawSession = data.session && typeof data.session === "object" ? data.session : null;
    const user = data.user && typeof data.user === "object"
      ? data.user
      : (rawSession && rawSession.user && typeof rawSession.user === "object" ? rawSession.user : null);
    const providerSession = normalizeProviderSessionForInternalStorage(rawSession, user, email);
    if (!providerSession) {
      return {
        ok: false,
        errorCode: "identity/provider-response-malformed",
      };
    }
    return {
      ok: true,
      rawSession: providerSession,
      userIdMasked: maskProviderUserId(providerSession.user.id),
      sessionExpiresAt: normalizeProviderSessionExpiresAt(providerSession.expires_at),
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: mapProviderVerifyError(error),
    };
  }
}

async function verifySignupEmailCode(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  const code = normalizeProviderOtpCode(input.code);
  if (!email || !code) {
    return {
      ok: false,
      errorCode: "identity/invalid-otp-code",
    };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return {
      ok: false,
      errorCode: "identity/provider-unavailable",
    };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.verifyOtp !== "function") {
      return {
        ok: false,
        errorCode: "identity/provider-unavailable",
      };
    }
    const result = await client.auth.verifyOtp({ email, token: code, type: "email" });
    if (result && result.error) {
      return {
        ok: false,
        errorCode: mapProviderVerifyError(result.error),
      };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : {};
    const rawSession = data.session && typeof data.session === "object" ? data.session : null;
    const user = data.user && typeof data.user === "object"
      ? data.user
      : (rawSession && rawSession.user && typeof rawSession.user === "object" ? rawSession.user : null);
    if (!rawSession) {
      return {
        ok: true,
        confirmationRequired: true,
        emailConfirmationRequired: true,
      };
    }
    const providerSession = normalizeProviderSessionForInternalStorage(rawSession, user, email);
    if (!providerSession) {
      return {
        ok: false,
        errorCode: "identity/provider-response-malformed",
      };
    }
    return {
      ok: true,
      rawSession: providerSession,
      userIdMasked: maskProviderUserId(providerSession.user.id),
      sessionExpiresAt: normalizeProviderSessionExpiresAt(providerSession.expires_at),
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: mapProviderVerifyError(error),
    };
  }
}

async function signUpWithPassword(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  const password = normalizeProviderPassword(input.password);
  if (!email) {
    return { ok: false, errorCode: "identity/invalid-email" };
  }
  if (!password) {
    return { ok: false, errorCode: "identity/password-invalid" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.signUp !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.signUp({ email, password });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderPasswordError(result.error) };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : {};
    const rawSession = data.session && typeof data.session === "object" ? data.session : null;
    const user = data.user && typeof data.user === "object"
      ? data.user
      : (rawSession && rawSession.user && typeof rawSession.user === "object" ? rawSession.user : null);
    if (!rawSession && user && Array.isArray(user.identities) && user.identities.length === 0) {
      return { ok: false, errorCode: "identity/account-already-exists" };
    }
    if (!rawSession) {
      return {
        ok: true,
        confirmationRequired: true,
        emailConfirmationRequired: true,
      };
    }
    const providerSession = normalizeProviderSessionForInternalStorage(rawSession, user, email);
    if (!providerSession) {
      return { ok: false, errorCode: "identity/provider-response-malformed" };
    }
    return {
      ok: true,
      rawSession: providerSession,
      userIdMasked: maskProviderUserId(providerSession.user.id),
      sessionExpiresAt: normalizeProviderSessionExpiresAt(providerSession.expires_at),
    };
  } catch (error) {
    return { ok: false, errorCode: mapProviderPasswordError(error) };
  }
}

async function resendSignupConfirmation(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  if (!email) {
    return { ok: false, errorCode: "identity/invalid-email" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.resend !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.resend({ type: "signup", email });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderPasswordResetError(result.error) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapProviderPasswordResetError(error) };
  }
}

async function signInWithPassword(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  const password = normalizeProviderPassword(input.password);
  if (!email) {
    return { ok: false, errorCode: "identity/invalid-email" };
  }
  if (!password) {
    return { ok: false, errorCode: "identity/password-invalid" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.signInWithPassword !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.signInWithPassword({ email, password });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderPasswordError(result.error) };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : {};
    const rawSession = data.session && typeof data.session === "object" ? data.session : null;
    const user = data.user && typeof data.user === "object"
      ? data.user
      : (rawSession && rawSession.user && typeof rawSession.user === "object" ? rawSession.user : null);
    const providerSession = normalizeProviderSessionForInternalStorage(rawSession, user, email);
    if (!providerSession) {
      return { ok: false, errorCode: "identity/provider-response-malformed" };
    }
    return {
      ok: true,
      rawSession: providerSession,
      userIdMasked: maskProviderUserId(providerSession.user.id),
      sessionExpiresAt: normalizeProviderSessionExpiresAt(providerSession.expires_at),
    };
  } catch (error) {
    return { ok: false, errorCode: mapProviderPasswordError(error) };
  }
}

async function requestPasswordReset(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const email = normalizeProviderEmail(input.email);
  if (!email) {
    return { ok: false, errorCode: "identity/invalid-email" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.resetPasswordForEmail !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.resetPasswordForEmail(email);
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderPasswordResetError(result.error) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapProviderPasswordResetError(error) };
  }
}

async function updatePasswordAfterRecovery(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const safeSession = normalizeProviderSignOutSession(rawSession);
  const password = normalizeProviderPassword(input && input.password);
  if (!password) {
    return { ok: false, errorCode: "identity/password-invalid" };
  }
  if (!safeSession) {
    return { ok: false, errorCode: "identity/password-update-session-missing" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        storage: createEphemeralProviderStorage(safeSession),
        storageKey: PROVIDER_SIGN_OUT_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.updateUser !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.updateUser({ password });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderPasswordUpdateError(result.error) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapProviderPasswordUpdateError(error) };
  }
}

async function changePassword(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const safeSession = normalizeProviderSignOutSession(rawSession);
  const currentPassword = normalizeProviderPassword(input && input.currentPassword);
  const password = normalizeProviderPassword(input && input.password);
  if (!currentPassword || !password) {
    return { ok: false, errorCode: "identity/password-invalid" };
  }
  if (!safeSession) {
    return { ok: false, errorCode: "identity/password-update-session-missing" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        storage: createEphemeralProviderStorage(safeSession),
        storageKey: PROVIDER_SIGN_OUT_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.updateUser !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.updateUser({
      password,
      current_password: currentPassword,
    });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderPasswordUpdateError(result.error) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: mapProviderPasswordUpdateError(error) };
  }
}

async function beginOAuthSignIn(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const provider = normalizeProviderOAuthProvider(input.provider);
  const redirectTo = normalizeProviderOAuthRedirectTo(input.redirectTo);
  if (provider !== "google") return { ok: false, errorCode: "identity/oauth-provider-unavailable" };
  if (!redirectTo) return { ok: false, errorCode: "identity/oauth-redirect-invalid" };
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const storage = createOAuthFlowStorage();
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        storage,
        storageKey: PROVIDER_OAUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
    if (!client || !client.auth || typeof client.auth.signInWithOAuth !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        scopes: "openid email profile",
        skipBrowserRedirect: true,
      },
    });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderOAuthError(result.error) };
    }
    const url = String(result && result.data && result.data.url || "").trim();
    if (!url || !/^https:\/\//i.test(url)) {
      return { ok: false, errorCode: "identity/oauth-response-malformed" };
    }
    return {
      ok: true,
      provider,
      url,
      flowState: {
        version: 1,
        provider,
        redirectTo,
        storage: storage.snapshot(),
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { ok: false, errorCode: mapProviderOAuthError(error) };
  }
}

async function completeOAuthSignIn(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const provider = normalizeProviderOAuthProvider(input.provider);
  const flowState = input.flowState && typeof input.flowState === "object" ? input.flowState : {};
  const redirectTo = normalizeProviderOAuthRedirectTo(flowState.redirectTo);
  const callbackUrl = normalizeProviderOAuthCallbackUrl(input.callbackUrl, redirectTo);
  if (provider !== "google" || flowState.provider !== "google") {
    return { ok: false, errorCode: "identity/oauth-provider-unavailable" };
  }
  if (!callbackUrl || !redirectTo) return { ok: false, errorCode: "identity/oauth-redirect-invalid" };
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/provider-auth-unavailable" };
  }
  try {
    const parsedCallback = new URL(callbackUrl);
    const callbackError = parsedCallback.searchParams.get("error") || parsedCallback.searchParams.get("error_code");
    if (callbackError) {
      return { ok: false, errorCode: mapProviderOAuthError({ message: callbackError }) };
    }
    const code = String(parsedCallback.searchParams.get("code") || "").trim();
    if (!code || code.length > 2048 || /[\s<>]/.test(code)) {
      return { ok: false, errorCode: "identity/oauth-callback-missing-code" };
    }
    const storage = createOAuthFlowStorage(sanitizeOAuthStorageSnapshot(flowState.storage));
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        storage,
        storageKey: PROVIDER_OAUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
    if (!client || !client.auth || typeof client.auth.exchangeCodeForSession !== "function") {
      return { ok: false, errorCode: "identity/provider-auth-unavailable" };
    }
    const result = await client.auth.exchangeCodeForSession(code);
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderOAuthError(result.error) };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : {};
    const rawSession = data.session && typeof data.session === "object" ? data.session : null;
    const user = data.user && typeof data.user === "object"
      ? data.user
      : (rawSession && rawSession.user && typeof rawSession.user === "object" ? rawSession.user : null);
    const providerSession = normalizeProviderSessionForInternalStorage(rawSession, user);
    if (!providerSession) {
      return { ok: false, errorCode: "identity/provider-response-malformed" };
    }
    return {
      ok: true,
      provider,
      rawSession: providerSession,
      userIdMasked: maskProviderUserId(providerSession.user.id),
      sessionExpiresAt: normalizeProviderSessionExpiresAt(providerSession.expires_at),
      credentialProvider: "google",
    };
  } catch (error) {
    return { ok: false, errorCode: mapProviderOAuthError(error) };
  }
}

async function refreshProviderSession(config, refreshTokenInput) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const refreshToken = normalizeProviderRefreshToken(refreshTokenInput);
  if (!refreshToken) {
    return {
      ok: false,
      errorCode: "identity/refresh-token-missing",
    };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return {
      ok: false,
      errorCode: "identity/provider-refresh-unavailable",
    };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.refreshSession !== "function") {
      return {
        ok: false,
        errorCode: "identity/provider-refresh-unavailable",
      };
    }
    const result = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (result && result.error) {
      return {
        ok: false,
        errorCode: mapProviderRefreshError(result.error),
      };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : {};
    const rawSession = data.session && typeof data.session === "object" ? data.session : null;
    const user = data.user && typeof data.user === "object"
      ? data.user
      : (rawSession && rawSession.user && typeof rawSession.user === "object" ? rawSession.user : null);
    const providerSession = normalizeProviderSessionForInternalStorage(rawSession, user);
    if (!providerSession) {
      return {
        ok: false,
        errorCode: "identity/provider-response-malformed",
      };
    }
    return {
      ok: true,
      rawSession: providerSession,
      userIdMasked: maskProviderUserId(providerSession.user.id),
      sessionExpiresAt: normalizeProviderSessionExpiresAt(providerSession.expires_at),
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: mapProviderRefreshError(error),
    };
  }
}

async function signOutProviderSession(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const safeSession = normalizeProviderSignOutSession(rawSession);
  if (!safeSession) {
    return {
      ok: false,
      errorCode: "identity/provider-sign-out-skipped",
    };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return {
      ok: false,
      errorCode: "identity/provider-sign-out-unavailable",
    };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerSignOutFetch,
      },
      auth: {
        storage: createEphemeralProviderStorage(safeSession),
        storageKey: PROVIDER_SIGN_OUT_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || !client.auth || typeof client.auth.signOut !== "function") {
      return {
        ok: false,
        errorCode: "identity/provider-sign-out-unavailable",
      };
    }
    const result = await client.auth.signOut({ scope: "local" });
    if (result && result.error) {
      return {
        ok: false,
        errorCode: mapProviderSignOutError(result.error),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: mapProviderSignOutError(error),
    };
  }
}

async function completeOnboarding(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const onboardingInput = normalizeProviderOnboardingInput(input);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const accessToken = normalizeProviderAccessToken(rawSession && rawSession.access_token);
  if (!onboardingInput) {
    return { ok: false, errorCode: "identity/onboarding-invalid-input" };
  }
  if (!accessToken) {
    return { ok: false, errorCode: "identity/onboarding-session-missing" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/onboarding-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/onboarding-provider-unavailable" };
    }
    const result = await client.rpc("complete_onboarding", {
      p_display_name: onboardingInput.displayName,
      p_avatar_color: onboardingInput.avatarColor,
      p_workspace_name: onboardingInput.workspaceName,
    });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderOnboardingError(result.error) };
    }
    const safeResult = normalizeProviderOnboardingResult(result && result.data);
    if (!safeResult) {
      return { ok: false, errorCode: "identity/onboarding-response-malformed" };
    }
    return { ok: true, ...safeResult };
  } catch (error) {
    return { ok: false, errorCode: mapProviderOnboardingError(error) };
  }
}

async function updateIdentityProfile(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const profileInput = normalizeProviderProfileUpdateInput(input);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const accessToken = normalizeProviderAccessToken(rawSession && rawSession.access_token);
  if (!profileInput) {
    return { ok: false, errorCode: "identity/account-update-invalid-input" };
  }
  if (!accessToken) {
    return { ok: false, errorCode: "identity/account-update-session-missing" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/account-update-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/account-update-provider-unavailable" };
    }
    const result = await client.rpc("update_identity_profile", {
      p_display_name: profileInput.displayName,
      p_avatar_color: profileInput.avatarColor,
    });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderAccountUpdateError(result.error) };
    }
    const safeResult = normalizeProviderProfileUpdateResult(result && result.data);
    if (!safeResult) {
      return { ok: false, errorCode: "identity/account-update-response-malformed" };
    }
    return { ok: true, ...safeResult };
  } catch (error) {
    return { ok: false, errorCode: mapProviderAccountUpdateError(error) };
  }
}

async function renameIdentityWorkspace(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const workspaceInput = normalizeProviderWorkspaceRenameInput(input);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const accessToken = normalizeProviderAccessToken(rawSession && rawSession.access_token);
  if (!workspaceInput) {
    return { ok: false, errorCode: "identity/account-update-invalid-input" };
  }
  if (!accessToken) {
    return { ok: false, errorCode: "identity/account-update-session-missing" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/account-update-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/account-update-provider-unavailable" };
    }
    const result = await client.rpc("rename_identity_workspace", {
      p_workspace_name: workspaceInput.workspaceName,
    });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderAccountUpdateError(result.error) };
    }
    const safeResult = normalizeProviderWorkspaceRenameResult(result && result.data);
    if (!safeResult) {
      return { ok: false, errorCode: "identity/account-update-response-malformed" };
    }
    return { ok: true, ...safeResult };
  } catch (error) {
    return { ok: false, errorCode: mapProviderAccountUpdateError(error) };
  }
}

async function loadIdentityState(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const accessToken = normalizeProviderAccessToken(rawSession && rawSession.access_token);
  if (!accessToken) {
    return { ok: false, errorCode: "identity/cloud-load-session-missing" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/cloud-load-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/cloud-load-provider-unavailable" };
    }
    const result = await client.rpc("load_identity_state");
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderIdentityLoadError(result.error) };
    }
    const safeResult = normalizeProviderIdentityStateResult(result && result.data);
    if (!safeResult) {
      return { ok: false, errorCode: "identity/cloud-load-response-malformed" };
    }
    return { ok: true, ...safeResult };
  } catch (error) {
    return { ok: false, errorCode: mapProviderIdentityLoadError(error) };
  }
}

// Phase 5.0E (browser): authed RPC wrapper for the device-session upsert.
// Pure SDK call with no side effects — the background owns token storage,
// hashing, label derivation, and the post-auth hook.
async function registerDeviceSession(config, accessToken, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const safeAccessToken = normalizeProviderAccessToken(accessToken);
  const safeInput = input && typeof input === "object" ? input : {};
  const surface = String(safeInput.surface || "").trim();
  const label = String(safeInput.label || "").trim().replace(/\s+/g, " ").slice(0, 64);
  const deviceTokenHash = String(safeInput.deviceTokenHash || "").trim();
  if (!safeAccessToken) {
    return { ok: false, errorCode: "identity/device-session-session-missing" };
  }
  // Match the migration's surface allow-list and CHECK constraints. Validate
  // here so a malformed input never round-trips to the server.
  if (!/^(ios_app|android_app|chrome_extension|firefox_extension|desktop_mac|desktop_windows|web)$/.test(surface)) {
    return { ok: false, errorCode: "identity/device-session-invalid-input" };
  }
  if (!label) {
    return { ok: false, errorCode: "identity/device-session-invalid-input" };
  }
  if (!/^[0-9a-f]{64}$/.test(deviceTokenHash)) {
    return { ok: false, errorCode: "identity/device-session-invalid-input" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/device-session-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${safeAccessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/device-session-provider-unavailable" };
    }
    const result = await client.rpc("register_device_session", {
      p_surface: surface,
      p_label: label,
      p_device_token_hash: deviceTokenHash,
    });
    if (result && result.error) {
      const err = result.error;
      const errorMessage = String(err && err.message || "").trim() || undefined;
      return {
        ok: false,
        errorCode: "identity/device-session-rejected",
        ...(errorMessage ? { errorMessage } : {}),
      };
    }
    const data = result && result.data && typeof result.data === "object" ? result.data : null;
    const session = data && data.session && typeof data.session === "object" ? data.session : null;
    if (!session || typeof session.id !== "string" || !session.id) {
      return { ok: false, errorCode: "identity/device-session-response-malformed" };
    }
    // Return only safe public fields. Do NOT echo the device_token_hash back.
    return {
      ok: true,
      session: {
        id: String(session.id),
        surface: typeof session.surface === "string" ? session.surface : surface,
        label: typeof session.label === "string" ? session.label : label,
        createdAt: typeof session.created_at === "string" ? session.created_at : null,
        lastSeenAt: typeof session.last_seen_at === "string" ? session.last_seen_at : null,
        revokedAt: typeof session.revoked_at === "string" ? session.revoked_at : null,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : undefined;
    return {
      ok: false,
      errorCode: "identity/device-session-rejected",
      ...(errorMessage ? { errorMessage } : {}),
    };
  }
}

async function markPasswordSetupCompleted(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const accessToken = normalizeProviderAccessToken(rawSession && rawSession.access_token);
  const source = String(input && input.source || "").trim();
  if (!accessToken) {
    return { ok: false, errorCode: "identity/credential-status-session-missing" };
  }
  if (!/^(password_sign_up|signup_confirmation|password_sign_in|password_recovery_update|password_account_change)$/.test(source)) {
    return { ok: false, errorCode: "identity/credential-status-invalid-source" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/credential-status-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/credential-status-provider-unavailable" };
    }
    const result = await client.rpc("mark_password_setup_completed", { p_source: source });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderCredentialStatusError(result.error) };
    }
    const credentialState = normalizeProviderCredentialState(
      result && result.data && (result.data.credential_state || result.data.credentialState)
    );
    if (credentialState !== "complete") {
      return { ok: false, errorCode: "identity/credential-status-response-malformed" };
    }
    return { ok: true, credentialState };
  } catch (error) {
    return { ok: false, errorCode: mapProviderCredentialStatusError(error) };
  }
}

async function markOAuthCredentialCompleted(config, input = {}) {
  const safeConfig = normalizeRealConfigSmokeInput(config);
  const rawSession = input && typeof input === "object" ? input.rawSession : null;
  const accessToken = normalizeProviderAccessToken(rawSession && rawSession.access_token);
  const provider = normalizeProviderOAuthProvider(input && input.provider);
  if (!accessToken) {
    return { ok: false, errorCode: "identity/credential-status-session-missing" };
  }
  if (provider !== "google") {
    return { ok: false, errorCode: "identity/credential-status-invalid-provider" };
  }
  if (!safeConfig || typeof ProviderSdk.createClient !== "function") {
    return { ok: false, errorCode: "identity/credential-status-provider-unavailable" };
  }
  try {
    const client = ProviderSdk.createClient(safeConfig.projectUrl, safeConfig.publicClient, {
      global: {
        fetch: providerOtpFetch,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (!client || typeof client.rpc !== "function") {
      return { ok: false, errorCode: "identity/credential-status-provider-unavailable" };
    }
    const result = await client.rpc("mark_oauth_credential_completed", { p_provider: provider });
    if (result && result.error) {
      return { ok: false, errorCode: mapProviderCredentialStatusError(result.error) };
    }
    const credentialState = normalizeProviderCredentialState(
      result && result.data && (result.data.credential_state || result.data.credentialState)
    );
    const credentialProvider = normalizeProviderCredentialProvider(
      result && result.data && (result.data.credential_provider || result.data.credentialProvider)
    );
    if (credentialState !== "complete" || credentialProvider !== "google") {
      return { ok: false, errorCode: "identity/credential-status-response-malformed" };
    }
    return { ok: true, credentialState, credentialProvider };
  } catch (error) {
    return { ok: false, errorCode: mapProviderCredentialStatusError(error) };
  }
}

const adapterProbe = Object.freeze({
  providerKind: "supabase",
  adapterLoaded: true,
  clientFactoryPresent: typeof ProviderSdk.createClient === "function",
  clientCreated: false,
  clientCreatedAtImport: false,
  clientSmokeAvailable: true,
  realConfigSmokeAvailable: true,
  configPresent: false,
  networkEnabled: false,
  networkObserved: false,
  authCallsObserved: false,
  otpEnabled: false,
  supportedPlannedOps: Object.freeze([
    "requestEmailOtp",
    "verifyEmailOtp",
    "verifySignupEmailCode",
    "signUpWithPassword",
    "resendSignupConfirmation",
    "signInWithPassword",
    "requestPasswordReset",
    "updatePasswordAfterRecovery",
    "changePassword",
    "refreshProviderSession",
    "signOutProviderSession",
    "completeOnboarding",
    "updateIdentityProfile",
    "renameIdentityWorkspace",
    "loadIdentityState",
    "registerDeviceSession",
    "markPasswordSetupCompleted",
    "beginOAuthSignIn",
    "completeOAuthSignIn",
    "markOAuthCredentialCompleted",
  ]),
});

const probe = Object.freeze({
  ok: true,
  version: "3.0R",
  phase: "3.0R",
  kind: "supabase-client-create-smoke",
  surface: "background",
  adapter: adapterProbe,
  clientSmoke: clientSmokeStatus(),
  realConfigSmoke: realConfigSmokeStatus(),
  runClientSmoke,
  runRealConfigClientSmoke,
  requestEmailOtp,
  verifyEmailOtp,
  verifySignupEmailCode,
  signUpWithPassword,
  resendSignupConfirmation,
  signInWithPassword,
  requestPasswordReset,
  updatePasswordAfterRecovery,
  changePassword,
  beginOAuthSignIn,
  completeOAuthSignIn,
  refreshProviderSession,
  signOutProviderSession,
  completeOnboarding,
  updateIdentityProfile,
  renameIdentityWorkspace,
  loadIdentityState,
  registerDeviceSession,
  markPasswordSetupCompleted,
  markOAuthCredentialCompleted,
  sdkImport: Object.freeze({
    package: "provider-sdk",
    importOk: sdkExportCount > 0,
    clientCreated: false,
    networkEnabled: false,
    networkObserved: false,
    authCallsObserved: false,
    otpEnabled: false,
  }),
});

globalThis.H2O_IDENTITY_PROVIDER_BUNDLE_PROBE = probe;
