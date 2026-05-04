import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ChangePasswordInput,
  DeviceSession,
  DeviceSessionSurface,
  H2OProfile,
  H2OWorkspace,
  IdentityErrorShape,
  IdentityMode,
  IdentityProvider,
  IdentityPublicState,
  IdentitySnapshot,
  InitialWorkspaceInput,
  ListDeviceSessionsResult,
  ProfilePatch,
  ProviderCapabilities,
  RegisterDeviceSessionInput,
  SignInEmailInput,
  SignInPasswordInput,
  SignUpPasswordInput,
  VerifyEmailCodeInput,
} from '@h2o/identity-core';
import {
  H2O_IDENTITY_CORE_VERSION,
  createIdentityError,
  createInitialIdentitySnapshot,
  isValidEmail,
  normalizeEmail,
  nowIso,
  transitionIdentity,
} from '@h2o/identity-core';
import { getMobileSupabaseConfig, type MobileSupabaseConfig } from './mobileConfig';
import {
  deleteRefreshToken,
  readDeviceToken,
  readRefreshToken,
  writeDeviceToken,
  writeRefreshToken,
} from './secureStore';
import { clearAllIdentityStorage, writeSessionMeta, writeSnapshot } from './mobileStorage';
import { selfCheckIdentitySnapshot } from './selfCheck';

const DEVICE_TOUCH_INTERVAL_MS = 10 * 60 * 1000;
const ALLOWED_DEVICE_SURFACES: ReadonlyArray<DeviceSessionSurface> = [
  'ios_app',
  'android_app',
  'chrome_extension',
  'firefox_extension',
  'desktop_mac',
  'desktop_windows',
  'web',
];
const DEFAULT_MOBILE_SURFACE: DeviceSessionSurface = 'ios_app';
const DEFAULT_MOBILE_LABEL = 'iPhone — Cockpit Pro';

// Phase 5.0F mobile Google OAuth — fixed redirect URI matching app.json's
// `scheme: "studiomobile"`. Must be present in the Supabase project's
// Authentication → URL Configuration → Redirect URLs allow-list before live QA.
const MOBILE_OAUTH_REDIRECT_URI = 'studiomobile://identity/oauth/google';

function mapMobileOAuthErrorCode(error: unknown): string {
  const src =
    error && typeof error === 'object'
      ? (error as { status?: number; statusCode?: number; message?: string })
      : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || '').toLowerCase();
  if (/access_denied|cancel|dismiss|closed/.test(message)) return 'identity/oauth-cancelled';
  if (/fetch|network|timeout|failed to fetch/.test(message)) return 'identity/provider-network-failed';
  if (/redirect|callback|code\s*verifier|pkce|invalid\s*code/.test(message)) return 'identity/oauth-callback-invalid';
  if (/provider.*disabled|unsupported|not\s*enabled/.test(message)) return 'identity/oauth-provider-unavailable';
  if (status === 429 || /rate|too many|cooldown/.test(message)) return 'identity/provider-rate-limited';
  if (status === 400 || status === 401 || /invalid|rejected/.test(message)) return 'identity/oauth-exchange-failed';
  if (status === 403 || /forbidden/.test(message)) return 'identity/provider-rejected';
  return 'identity/oauth-failed';
}

// ─── module-private helpers ───────────────────────────────────────────────────

function isIdentityError(value: unknown): value is IdentityErrorShape {
  return Boolean(
    value && typeof value === 'object' && 'code' in value && 'message' in value && 'at' in value
  );
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeAuthErrorSnapshot(
  previous: IdentitySnapshot,
  error: IdentityErrorShape,
  clearSession = false
): IdentitySnapshot {
  return {
    version: H2O_IDENTITY_CORE_VERSION,
    status: 'auth_error',
    mode: clearSession ? 'local_dev' : previous.mode,
    provider: clearSession ? 'mock_local' : previous.provider,
    pendingEmail: clearSession ? null : (previous.pendingEmail ?? null),
    emailVerified: clearSession ? false : previous.emailVerified,
    profile: clearSession ? null : (previous.profile ?? null),
    workspace: clearSession ? null : (previous.workspace ?? null),
    onboardingCompleted: clearSession ? false : previous.onboardingCompleted,
    lastError: error,
    updatedAt: nowIso(),
  };
}

function mapPasswordUpdateErrorCode(error: unknown): string {
  const src =
    error && typeof error === 'object'
      ? (error as { status?: number; statusCode?: number; message?: string })
      : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || '').toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return 'identity/provider-rate-limited';
  if (/fetch|network|timeout|failed to fetch/.test(message)) return 'identity/provider-network-failed';
  if (/weak|password should be|at least|minimum|short/.test(message)) return 'identity/password-weak';
  if (/current password|invalid.*password|password.*incorrect|wrong password|credentials/.test(message)) {
    return 'identity/password-current-invalid';
  }
  if (/recent|reauth|nonce|same password/.test(message)) {
    return 'identity/password-update-requires-recent-code';
  }
  if (status === 400 || status === 401 || /session|jwt|token|auth/.test(message)) {
    return 'identity/password-update-session-missing';
  }
  if (status === 403 || /rejected|not allowed|forbidden/.test(message)) return 'identity/provider-rejected';
  return 'identity/password-update-failed';
}

function mapRecoveryRequestErrorCode(error: unknown): string {
  const src =
    error && typeof error === 'object'
      ? (error as { status?: number; statusCode?: number; message?: string })
      : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || '').toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return 'identity/provider-rate-limited';
  if (/fetch|network|timeout|failed to fetch/.test(message)) return 'identity/provider-network-failed';
  // 5.0D v1 explicit-feedback policy: surface unregistered-email cases as a
  // distinct identity code so the recovery UI can guide the user to sign up.
  // This is an intentional product tradeoff against anti-enumeration on the
  // mobile recovery surface only — see Phase 5.0D spec § Explicit-feedback policy.
  // Detected signals: signups-not-allowed / user-not-found / generic 4xx with
  // shouldCreateUser:false (most common cause is unregistered email) /
  // forbidden / rejected (per product decision, also surfaced as unregistered).
  if (
    /signups?\s*not\s*allowed|user[\s_-]?not[\s_-]?found|email[\s_-]?not[\s_-]?registered|not\s*registered|user.*does\s*not\s*exist/.test(message)
  ) {
    return 'identity/recovery-email-not-registered';
  }
  if (status === 422 || status === 400) {
    return 'identity/recovery-email-not-registered';
  }
  if (status === 403 || /rejected|not\s*allowed|forbidden/.test(message)) {
    return 'identity/recovery-email-not-registered';
  }
  return 'identity/request-recovery-failed';
}

function mapRecoveryVerifyErrorCode(error: unknown): string {
  const src =
    error && typeof error === 'object'
      ? (error as { status?: number; statusCode?: number; message?: string })
      : {};
  const status = Number(src.status || src.statusCode || 0);
  const message = String(src.message || '').toLowerCase();
  if (status === 429 || /rate|too many|cooldown/.test(message)) return 'identity/provider-rate-limited';
  if (/fetch|network|timeout|failed to fetch/.test(message)) return 'identity/provider-network-failed';
  if (/expired|expired token|expired otp/.test(message)) return 'identity/recovery-code-expired';
  if (status === 403 || /rejected|not allowed|forbidden/.test(message)) return 'identity/provider-rejected';
  return 'identity/verify-recovery-failed';
}

interface RpcIdentityState {
  profile?: unknown;
  workspace?: unknown;
}

// ─── MobileSupabaseProvider ───────────────────────────────────────────────────

export class MobileSupabaseProvider implements IdentityProvider {
  readonly kind = 'supabase' as const;

  get mode(): IdentityMode {
    return this.snapshot.mode;
  }

  readonly capabilities: ProviderCapabilities = {
    emailMagicLink: false,
    emailOtp: true,
    profileRead: true,
    profileWrite: true,
    persistentSession: true,
    cloudSync: false,
  };

  private snapshot: IdentitySnapshot;
  private accessToken: string | null = null;
  private _client: SupabaseClient | null = null;

  // Recovery scratch — held in memory only. Never persisted to SecureStore
  // until setPasswordAfterRecovery succeeds. Cleared on every requestRecoveryCode
  // call and on signOut. If the app is killed mid-recovery, these are lost and
  // the user must restart the recovery flow from email.
  private recoveryVerified = false;
  private recoveryAccessToken: string | null = null;
  private recoveryRefreshToken: string | null = null;

  // Device-session scratch — held in memory only.
  // - deviceSessionId: server-issued row id from register/touch; used to mark
  //   "this device" in the active-sessions list. Lost on app restart, but the
  //   auto-register hook on every successful refresh / sign-in repopulates it.
  // - lastDeviceTouchAt: epoch ms of the last touch RPC call; touch is
  //   rate-limited to once every DEVICE_TOUCH_INTERVAL_MS to avoid pointless
  //   round-trips on AppState foreground events.
  private deviceSessionId: string | null = null;
  private lastDeviceTouchAt = 0;

  constructor() {
    this.snapshot = createInitialIdentitySnapshot({ provider: 'mock_local' });
  }

  getSnapshot(): IdentitySnapshot {
    return structuredCloneSafe(this.snapshot);
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private getClient(config: MobileSupabaseConfig): SupabaseClient {
    if (!this._client) {
      this._client = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    }
    return this._client;
  }

  private getAuthedClient(config: MobileSupabaseConfig): SupabaseClient {
    const token = this.accessToken;
    if (!token) throw createIdentityError('identity/no-session', 'No active session.');
    return createClient(config.url, config.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  private async fail(
    error: unknown,
    fallbackCode: string,
    opts: { persist?: boolean; clearSession?: boolean } = {}
  ): Promise<IdentitySnapshot> {
    const identityError = isIdentityError(error)
      ? error
      : createIdentityError(
          fallbackCode,
          error instanceof Error ? error.message : 'Provider operation failed.',
          error
        );

    let snap = makeAuthErrorSnapshot(this.snapshot, identityError, opts.clearSession ?? false);
    const check = selfCheckIdentitySnapshot(snap);
    if (!check.ok) {
      snap = makeAuthErrorSnapshot(this.snapshot, identityError, true);
    }
    this.snapshot = snap;

    if (opts.persist !== false) {
      try { await writeSnapshot(snap); } catch { /* non-fatal */ }
    }
    return this.getSnapshot();
  }

  private async failSoft(error: unknown, fallbackCode: string): Promise<IdentitySnapshot> {
    const identityError = isIdentityError(error)
      ? error
      : createIdentityError(
          fallbackCode,
          error instanceof Error ? error.message : 'Identity operation failed.'
        );
    // Deliberately omitting `detail` argument — for password operations the raw
    // provider error could echo request payload. Keep it out of snapshot/storage.
    this.snapshot = { ...this.snapshot, lastError: identityError, updatedAt: nowIso() };
    try { await writeSnapshot(this.snapshot); } catch { /* non-fatal */ }
    return this.getSnapshot();
  }

  private async commitSnapshot(snap: IdentitySnapshot): Promise<IdentitySnapshot> {
    const check = selfCheckIdentitySnapshot(snap);
    if (!check.ok) {
      snap = makeAuthErrorSnapshot(
        this.snapshot,
        createIdentityError(
          'identity/snapshot-leak',
          'Snapshot contains unsafe keys.',
          check.violations
        ),
        true
      );
    }
    this.snapshot = snap;
    try { await writeSnapshot(snap); } catch { /* non-fatal */ }
    return this.getSnapshot();
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private stringField(record: Record<string, unknown> | null, ...keys: string[]): string {
    if (!record) return '';
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string') {
        const text = value.trim();
        if (text) return text;
      }
    }
    return '';
  }

  private booleanField(record: Record<string, unknown> | null, ...keys: string[]): boolean {
    if (!record) return false;
    for (const key of keys) {
      if (typeof record[key] === 'boolean') return record[key] === true;
    }
    return false;
  }

  private timestampField(record: Record<string, unknown> | null, ...keys: string[]): string {
    const value = this.stringField(record, ...keys);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : nowIso();
  }

  private normalizedEmailCandidate(...candidates: Array<string | null | undefined>): string | null {
    for (const candidate of candidates) {
      const email = normalizeEmail(candidate ?? '');
      if (isValidEmail(email)) return email;
    }
    return null;
  }

  private normalizeRpcWorkspace(
    value: unknown,
    ownerUserIdFallback: string
  ): H2OWorkspace | null {
    const workspace = this.asRecord(value);
    const id = this.stringField(workspace, 'id');
    const name = this.stringField(workspace, 'name');
    const ownerUserId = this.stringField(workspace, 'ownerUserId', 'owner_user_id') || ownerUserIdFallback;
    if (!id || !name || !ownerUserId) return null;

    return {
      id,
      ownerUserId,
      name,
      origin: 'provider_backed',
      createdAt: this.timestampField(workspace, 'createdAt', 'created_at'),
      updatedAt: this.timestampField(workspace, 'updatedAt', 'updated_at'),
    };
  }

  private normalizeRpcProfile(
    value: unknown,
    emailFallback: string | null,
    workspaceIdFallback: string
  ): H2OProfile | null {
    const profile = this.asRecord(value);
    const id = this.stringField(profile, 'id');
    const userId = this.stringField(profile, 'userId', 'user_id') || id;
    const email = this.normalizedEmailCandidate(
      this.stringField(profile, 'email'),
      emailFallback
    );
    const displayName = this.stringField(profile, 'displayName', 'display_name');
    if (!id || !userId || !email || !displayName) return null;

    const workspaceId =
      this.stringField(profile, 'workspaceId', 'workspace_id') || workspaceIdFallback;
    const avatarColor = this.stringField(profile, 'avatarColor', 'avatar_color');

    return {
      id,
      userId,
      email,
      emailVerified: true,
      displayName,
      ...(avatarColor ? { avatarColor } : {}),
      workspaceId,
      onboardingCompleted: this.booleanField(profile, 'onboardingCompleted', 'onboarding_completed'),
      createdAt: this.timestampField(profile, 'createdAt', 'created_at'),
      updatedAt: this.timestampField(profile, 'updatedAt', 'updated_at'),
    };
  }

  private snapshotEmailFallback(): string | null {
    return this.normalizedEmailCandidate(this.snapshot.profile?.email, this.snapshot.pendingEmail);
  }

  private buildSnapshotFromRpc(
    result: RpcIdentityState | null,
    emailFallback?: string | null
  ): IdentitySnapshot {
    const profileRecord = this.asRecord(result?.profile);
    const workspaceRecord = this.asRecord(result?.workspace);
    const profileUserId =
      this.stringField(profileRecord, 'userId', 'user_id') ||
      this.stringField(profileRecord, 'id');
    const workspaceId = this.stringField(workspaceRecord, 'id');
    const fallbackEmail = this.normalizedEmailCandidate(emailFallback, this.snapshotEmailFallback());
    const workspace = this.normalizeRpcWorkspace(workspaceRecord, profileUserId);
    const profile = this.normalizeRpcProfile(profileRecord, fallbackEmail, workspace?.id || workspaceId);
    const status: IdentityPublicState =
      profile && workspace ? 'sync_ready' : profile ? 'profile_ready' : 'verified_no_profile';

    return {
      version: H2O_IDENTITY_CORE_VERSION,
      status,
      mode: 'provider_backed',
      provider: 'supabase',
      pendingEmail: profile?.email ? null : fallbackEmail,
      emailVerified: true,
      profile,
      workspace,
      onboardingCompleted: Boolean(profile?.onboardingCompleted),
      lastError: null,
      updatedAt: nowIso(),
    };
  }

  private async storeSession(session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    user?: { id?: string; email?: string | null } | null;
  }): Promise<void> {
    this.accessToken = session.access_token;
    if (session.refresh_token) {
      await writeRefreshToken(session.refresh_token);
    }
    await writeSessionMeta({
      sessionExpiresAt: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      userIdMasked: session.user?.id ? `${session.user.id.slice(0, 8)}...` : null,
    });
  }

  // ─── device-session helpers ───────────────────────────────────────────────
  // Device-session token plaintext lives on-device only (SecureStore). The
  // server stores its SHA-256 in public.device_sessions.device_token_hash. The
  // plain value is never sent to the server, never logged, and never persisted
  // outside SecureStore.

  private async generateDeviceTokenHex(): Promise<string> {
    // Expo Crypto routes to native iOS SecRandomCopyBytes / Android SecureRandom.
    // No WebCrypto fallback: Hermes does not expose globalThis.crypto on mobile,
    // and this provider only ever runs in the React Native app.
    const bytes = await Crypto.getRandomBytesAsync(32);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
  }

  private async hashDeviceTokenHex(value: string): Promise<string> {
    // Expo Crypto's HEX encoding is documented as lowercase; .toLowerCase() is
    // defensive to satisfy the DB CHECK constraint device_token_hash ~ '^[0-9a-f]{64}$'.
    const hex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      value,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    return hex.toLowerCase();
  }

  private async ensureDeviceTokenAndHash(): Promise<{ tokenHex: string; hashHex: string }> {
    let tokenHex = await readDeviceToken();
    if (!tokenHex || !/^[0-9a-f]{64}$/.test(tokenHex)) {
      tokenHex = await this.generateDeviceTokenHex();
      await writeDeviceToken(tokenHex);
    }
    const hashHex = await this.hashDeviceTokenHex(tokenHex);
    return { tokenHex, hashHex };
  }

  private parseDeviceSessionPayload(value: unknown): DeviceSession | null {
    const record = this.asRecord(value);
    if (!record) return null;
    const id = this.stringField(record, 'id');
    const surface = this.stringField(record, 'surface');
    const label = this.stringField(record, 'label');
    if (!id || !surface || !label) return null;
    if (!ALLOWED_DEVICE_SURFACES.includes(surface as DeviceSessionSurface)) return null;
    const revokedRaw = record.revoked_at ?? record.revokedAt;
    const revokedParsed = typeof revokedRaw === 'string' ? Date.parse(revokedRaw) : NaN;
    const revokedAt = Number.isFinite(revokedParsed) ? new Date(revokedParsed).toISOString() : null;
    return {
      id,
      surface: surface as DeviceSessionSurface,
      label,
      createdAt: this.timestampField(record, 'createdAt', 'created_at'),
      lastSeenAt: this.timestampField(record, 'lastSeenAt', 'last_seen_at'),
      revokedAt,
    };
  }

  private fireAndForgetRegisterDevice(): void {
    this.registerDeviceSession({
      surface: DEFAULT_MOBILE_SURFACE,
      label: DEFAULT_MOBILE_LABEL,
    }).catch(() => {
      /* best-effort; failure must never block auth flow */
    });
  }

  // ─── public methods ───────────────────────────────────────────────────────

  async signInWithEmail(input: SignInEmailInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const email = normalizeEmail(input.email);
      if (!email) throw createIdentityError('identity/invalid-email', 'Enter a valid email address.');

      const client = this.getClient(config);
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;

      const snap = transitionIdentity(this.snapshot, 'email_pending', {
        pendingEmail: email,
        mode: 'provider_backed',
        provider: 'supabase',
      });
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/sign-in-email-failed');
    }
  }

  async resendVerification(email: string): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const target = normalizeEmail(email || this.snapshot.pendingEmail || '');
      if (!target) throw createIdentityError('identity/missing-email', 'Enter a valid email address.');

      const client = this.getClient(config);
      const { error } = await client.auth.signInWithOtp({
        email: target,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;

      const targetStatus =
        this.snapshot.status === 'email_confirmation_pending'
          ? ('email_confirmation_pending' as const)
          : ('email_pending' as const);
      const snap = transitionIdentity(this.snapshot, targetStatus, {
        pendingEmail: target,
        mode: 'provider_backed',
        provider: 'supabase',
      });
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/resend-verification-failed');
    }
  }

  async verifyEmailCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const email = normalizeEmail(input.email || this.snapshot.pendingEmail || '');
      if (!email) throw createIdentityError('identity/missing-email', 'No pending email to verify.');
      const code = String(input.code || '').trim();
      if (!code) throw createIdentityError('identity/missing-code', 'Enter a verification code.');

      const client = this.getClient(config);
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.session) {
        throw error ?? createIdentityError('identity/verify-failed', 'Verification failed: no session returned.');
      }

      await this.storeSession(data.session);
      this.fireAndForgetRegisterDevice();

      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('load_identity_state');
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(rpcData as RpcIdentityState | null, email);
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/verify-email-failed');
    }
  }

  async handleVerificationCallback(_urlOrLocation?: string | Location | URL): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError(
        'identity/callback-not-supported',
        'Verification callbacks are not supported on mobile. Use verifyEmailCode instead.'
      ),
      'identity/callback-not-supported',
      { persist: false }
    );
  }

  async signUpWithPassword(input: SignUpPasswordInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const email = normalizeEmail(input.email);
      if (!email) throw createIdentityError('identity/invalid-email', 'Enter a valid email address.');
      if (!String(input.password || '').trim()) {
        throw createIdentityError('identity/missing-password', 'Enter a password.');
      }

      const client = this.getClient(config);
      const { error } = await client.auth.signUp({ email, password: input.password });
      if (error) throw error;

      const snap = transitionIdentity(this.snapshot, 'email_confirmation_pending', {
        pendingEmail: email,
        mode: 'provider_backed',
        provider: 'supabase',
      });
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/sign-up-failed');
    }
  }

  async verifySignupCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const email = normalizeEmail(input.email || this.snapshot.pendingEmail || '');
      if (!email) throw createIdentityError('identity/missing-email', 'No pending email to verify.');
      const code = String(input.code || '').trim();
      if (!code) throw createIdentityError('identity/missing-code', 'Enter a verification code.');

      const client = this.getClient(config);
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.session) {
        throw error ?? createIdentityError('identity/verify-failed', 'Signup verification failed: no session returned.');
      }

      await this.storeSession(data.session);
      this.fireAndForgetRegisterDevice();

      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('load_identity_state');
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(rpcData as RpcIdentityState | null, email);
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/verify-signup-failed');
    }
  }

  async signInWithPassword(input: SignInPasswordInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const email = this.normalizedEmailCandidate(input.email);
      const client = this.getClient(config);
      const { data, error } = await client.auth.signInWithPassword({
        email: email ?? input.email,
        password: input.password,
      });
      if (error || !data.session) {
        throw error ?? createIdentityError('identity/sign-in-failed', 'Sign in failed: no session returned.');
      }

      await this.storeSession(data.session);
      this.fireAndForgetRegisterDevice();

      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('load_identity_state');
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(
        rpcData as RpcIdentityState | null,
        this.normalizedEmailCandidate(email, data.session.user?.email)
      );
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/sign-in-password-failed');
    }
  }

  async createInitialWorkspace(input: InitialWorkspaceInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      if (!this.accessToken) {
        throw createIdentityError('identity/no-session', 'No active session. Sign in first.');
      }

      const authedClient = this.getAuthedClient(config);
      // Match SQL: complete_onboarding(p_display_name, p_avatar_color, p_workspace_name)
      // PostgREST routes RPC by parameter name; unprefixed keys would fail the
      // function-cache lookup. Same parameter-name fix as update_identity_profile.
      const { data: rpcData, error: rpcError } = await authedClient.rpc('complete_onboarding', {
        p_display_name: input.displayName ?? null,
        p_avatar_color: input.avatarColor ?? null,
        p_workspace_name: input.workspaceName ?? null,
      });
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(rpcData as RpcIdentityState | null, this.snapshotEmailFallback());
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/create-workspace-failed');
    }
  }

  async updateProfile(patch: ProfilePatch): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.failSoft(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured'
      );
    }
    try {
      if (!this.accessToken) {
        throw createIdentityError('identity/no-session', 'No active session. Sign in first.');
      }
      if (!this.snapshot.profile) {
        throw createIdentityError('identity/no-profile', 'No profile exists to update.');
      }

      // Provider-local sanitization that matches the live DB constraint:
      //   profiles.avatar_color CHECK (avatar_color ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
      //   profiles.display_name CHECK (char_length(btrim(display_name)) between 1 and 64)
      // identity-core's sanitizeProfilePatch only accepts hex avatar colors and
      // would silently drop slugs, so it is intentionally bypassed here for the
      // avatar field. Display name follows the same trim/collapse rule as
      // sanitizeProfilePatch (max 80 chars; server enforces 64).
      const cleanDisplayName =
        typeof patch.displayName === 'string'
          ? patch.displayName.trim().replace(/\s+/g, ' ').slice(0, 80)
          : '';
      const cleanAvatarColor =
        typeof patch.avatarColor === 'string'
        && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(patch.avatarColor.trim())
          ? patch.avatarColor.trim()
          : '';

      const authedClient = this.getAuthedClient(config);
      // Match the SQL function signature exactly:
      //   public.update_identity_profile(p_display_name text, p_avatar_color text)
      const { data: rpcData, error: rpcError } = await authedClient.rpc('update_identity_profile', {
        p_display_name: cleanDisplayName || null,
        p_avatar_color: cleanAvatarColor || null,
      });
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(rpcData as RpcIdentityState | null, this.snapshotEmailFallback());
      return this.commitSnapshot(snap);
    } catch (error) {
      // Use failSoft so a failed profile edit preserves signed-in status (would
      // otherwise flip to auth_error and effectively log the user out).
      return this.failSoft(error, 'identity/update-profile-failed');
    }
  }

  async renameWorkspace(name: string): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.failSoft(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured'
      );
    }
    try {
      if (!this.accessToken) {
        throw createIdentityError('identity/no-session', 'No active session. Sign in first.');
      }
      if (!this.snapshot.workspace) {
        throw createIdentityError('identity/no-workspace', 'No workspace exists to rename.');
      }

      // Provider-local sanitization to match the live DB constraint:
      //   workspaces.name CHECK (char_length(btrim(name)) between 1 and 64)
      const cleanName =
        typeof name === 'string'
          ? name.trim().replace(/\s+/g, ' ').slice(0, 80)
          : '';
      if (!cleanName) {
        throw createIdentityError('identity/missing-workspace-name', 'Enter a workspace name.');
      }

      const authedClient = this.getAuthedClient(config);
      // Match SQL: rename_identity_workspace(p_workspace_name text)
      const { data: rpcData, error: rpcError } = await authedClient.rpc('rename_identity_workspace', {
        p_workspace_name: cleanName,
      });
      if (rpcError) throw rpcError;

      // RPC returns { workspace: {id, name, created_at, updated_at}, role: 'owner' } —
      // it omits owner_user_id and origin. Patch onto the existing snapshot.workspace
      // to preserve those fields without requiring another round trip.
      const responseWorkspace = (rpcData as { workspace?: unknown } | null)?.workspace;
      const responseRecord = this.asRecord(responseWorkspace);
      const newName = this.stringField(responseRecord, 'name');
      const newId = this.stringField(responseRecord, 'id');
      const newUpdatedAt = this.timestampField(responseRecord, 'updatedAt', 'updated_at');
      if (!newId || !newName) {
        throw createIdentityError(
          'identity/rename-workspace-failed',
          'Workspace update did not return a valid workspace.'
        );
      }
      const existing = this.snapshot.workspace;
      const patchedWorkspace = {
        ...existing,
        id: newId,
        name: newName,
        updatedAt: newUpdatedAt,
      };

      this.snapshot = {
        ...this.snapshot,
        workspace: patchedWorkspace,
        lastError: null,
        updatedAt: nowIso(),
      };
      try { await writeSnapshot(this.snapshot); } catch { /* non-fatal */ }
      return this.getSnapshot();
    } catch (error) {
      // Use failSoft so a failed workspace rename preserves signed-in status.
      return this.failSoft(error, 'identity/rename-workspace-failed');
    }
  }

  async refreshSession(): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) {
        throw createIdentityError('identity/no-refresh-token', 'No stored refresh token. Please sign in.');
      }

      const client = this.getClient(config);
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        throw error ?? createIdentityError('identity/refresh-failed', 'Session refresh failed: no session returned.');
      }

      await this.storeSession(data.session);
      this.fireAndForgetRegisterDevice();

      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('load_identity_state');
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(
        rpcData as RpcIdentityState | null,
        this.normalizedEmailCandidate(
          data.session.user?.email,
          this.snapshot.profile?.email,
          this.snapshot.pendingEmail
        )
      );
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/refresh-session-failed');
    }
  }

  async signOut(): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (config && this.accessToken) {
      try {
        const client = this.getClient(config);
        await client.auth.signOut({ scope: 'local' });
      } catch { /* non-fatal: cleanup proceeds regardless */ }
    }

    this.accessToken = null;
    this.recoveryVerified = false;
    this.recoveryAccessToken = null;
    this.recoveryRefreshToken = null;
    // Phase 5.0E v1: keep the SecureStore device token across sign-outs so the
    // same device row is reused on next sign-in (idempotent register). Only
    // the in-memory id + touch timestamp are reset.
    this.deviceSessionId = null;
    this.lastDeviceTouchAt = 0;
    await deleteRefreshToken();
    await clearAllIdentityStorage();

    this.snapshot = createInitialIdentitySnapshot({ provider: 'mock_local' });
    try { await writeSnapshot(this.snapshot); } catch { /* non-fatal */ }
    return this.getSnapshot();
  }

  // ─── recovery (v1: email-code recovery; gated by RECOVERY_FLOW_VERIFIED in UI) ─

  async requestRecoveryCode(email: string): Promise<IdentitySnapshot> {
    // Reset any prior recovery scratch — every request restarts the flow.
    this.recoveryVerified = false;
    this.recoveryAccessToken = null;
    this.recoveryRefreshToken = null;

    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.failSoft(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured'
      );
    }
    try {
      const normalized = normalizeEmail(email);
      if (!isValidEmail(normalized)) {
        throw createIdentityError('identity/invalid-email', 'Enter a valid email address.');
      }

      const client = this.getClient(config);
      // Anti-enumeration: shouldCreateUser=false makes Supabase silently no-op
      // for unknown emails. Both branches return the same shape — the provider
      // treats them identically and the snapshot transition is unconditional.
      const { error } = await client.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: false },
      });
      if (error) {
        throw createIdentityError(
          mapRecoveryRequestErrorCode(error),
          'Recovery request failed.'
        );
      }

      const snap: IdentitySnapshot = {
        version: H2O_IDENTITY_CORE_VERSION,
        status: 'recovery_code_pending',
        mode: 'provider_backed',
        provider: 'supabase',
        pendingEmail: normalized,
        emailVerified: false,
        profile: null,
        workspace: null,
        onboardingCompleted: false,
        lastError: null,
        updatedAt: nowIso(),
      };
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.failSoft(error, 'identity/request-recovery-failed');
    }
  }

  async verifyRecoveryCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.failSoft(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured'
      );
    }
    try {
      if (this.snapshot.status !== 'recovery_code_pending') {
        throw createIdentityError(
          'identity/recovery-state-invalid',
          'Start the recovery flow again from your email.'
        );
      }
      const email = normalizeEmail(input.email || this.snapshot.pendingEmail || '');
      if (!email) {
        throw createIdentityError(
          'identity/recovery-state-invalid',
          'Start the recovery flow again from your email.'
        );
      }
      if (this.snapshot.pendingEmail && this.snapshot.pendingEmail !== email) {
        throw createIdentityError(
          'identity/recovery-state-invalid',
          'Start the recovery flow again from your email.'
        );
      }
      const code = String(input.code || '').trim();
      if (!code) throw createIdentityError('identity/missing-code', 'Enter a verification code.');

      const client = this.getClient(config);
      const { data, error } = await client.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });
      if (error || !data.session) {
        throw createIdentityError(
          mapRecoveryVerifyErrorCode(error),
          "That code didn't work. Try requesting a new one."
        );
      }

      // Hold session tokens IN MEMORY ONLY. Refresh token is not written to
      // SecureStore here, session metadata is not written, and the snapshot
      // stays at recovery_code_pending. Tokens graduate to a normal persisted
      // session only when setPasswordAfterRecovery succeeds.
      this.recoveryAccessToken = data.session.access_token;
      this.recoveryRefreshToken = data.session.refresh_token ?? null;
      this.recoveryVerified = true;

      this.snapshot = { ...this.snapshot, lastError: null, updatedAt: nowIso() };
      try { await writeSnapshot(this.snapshot); } catch { /* non-fatal */ }
      return this.getSnapshot();
    } catch (error) {
      return this.failSoft(error, 'identity/verify-recovery-failed');
    }
  }

  async setPasswordAfterRecovery(newPassword: string): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.failSoft(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured'
      );
    }
    try {
      if (
        this.snapshot.status !== 'recovery_code_pending' ||
        !this.recoveryVerified ||
        !this.recoveryAccessToken ||
        !this.recoveryRefreshToken
      ) {
        throw createIdentityError(
          'identity/recovery-state-invalid',
          'Start the recovery flow again from your email.'
        );
      }
      const password = String(newPassword || '').trim();
      if (!password) {
        throw createIdentityError('identity/missing-new-password', 'Enter a new password.');
      }
      if (password.length < 8) {
        throw createIdentityError(
          'identity/password-too-short',
          'New password must be at least 8 characters.'
        );
      }

      const ephemeral = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const setRes = await ephemeral.auth.setSession({
        access_token: this.recoveryAccessToken,
        refresh_token: this.recoveryRefreshToken,
      });
      if (setRes.error) {
        throw createIdentityError(
          'identity/password-update-session-missing',
          'Your session expired. Start the recovery flow again from your email.'
        );
      }

      // Note: NO current_password — the recovery context cannot require the old
      // password (the whole point of recovery is the old one is unknown).
      const result = await ephemeral.auth.updateUser({ password });
      if (result.error) {
        throw createIdentityError(
          mapPasswordUpdateErrorCode(result.error),
          'Password update failed.'
        );
      }

      // Promote the in-memory recovery scratch to a normal persisted session.
      const sessionUser =
        (setRes.data as { user?: { id?: string; email?: string | null } | null } | null)?.user ?? null;
      const recoveryAccess = this.recoveryAccessToken;
      const recoveryRefresh = this.recoveryRefreshToken;
      this.recoveryVerified = false;
      this.recoveryAccessToken = null;
      this.recoveryRefreshToken = null;
      await this.storeSession({
        access_token: recoveryAccess,
        refresh_token: recoveryRefresh,
        user: sessionUser,
      });
      this.fireAndForgetRegisterDevice();

      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('load_identity_state');
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(
        rpcData as RpcIdentityState | null,
        this.snapshot.pendingEmail
      );
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.failSoft(error, 'identity/password-update-failed');
    }
  }

  async changePassword(input: ChangePasswordInput): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.failSoft(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured'
      );
    }
    try {
      const currentPassword = String(input.currentPassword || '').trim();
      const newPassword = String(input.newPassword || '').trim();
      if (!currentPassword) {
        throw createIdentityError('identity/missing-current-password', 'Enter your current password.');
      }
      if (!newPassword) {
        throw createIdentityError('identity/missing-new-password', 'Enter a new password.');
      }
      if (newPassword.length < 8) {
        throw createIdentityError('identity/password-too-short', 'New password must be at least 8 characters.');
      }
      if (newPassword === currentPassword) {
        throw createIdentityError('identity/password-same-as-current', 'New password must be different from current.');
      }
      if (!this.accessToken) {
        throw createIdentityError('identity/password-update-session-missing', 'Your session expired. Please sign in again.');
      }
      const refreshToken = await readRefreshToken();
      if (!refreshToken) {
        throw createIdentityError('identity/password-update-session-missing', 'Your session expired. Please sign in again.');
      }

      const ephemeral = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const setRes = await ephemeral.auth.setSession({
        access_token: this.accessToken,
        refresh_token: refreshToken,
      });
      if (setRes.error) {
        throw createIdentityError('identity/password-update-session-missing', 'Your session expired. Please sign in again.');
      }

      // current_password is honored server-side; SDK type defs may omit it.
      const updatePayload = {
        password: newPassword,
        current_password: currentPassword,
      } as Parameters<typeof ephemeral.auth.updateUser>[0];
      const result = await ephemeral.auth.updateUser(updatePayload);
      if (result.error) {
        throw createIdentityError(
          mapPasswordUpdateErrorCode(result.error),
          'Password update failed.'
        );
      }

      // Conservative token rotation: only act if updateUser returned a fresh session.
      const data = (result.data ?? {}) as {
        session?: {
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          user?: { id?: string; email?: string | null } | null;
        } | null;
      };
      const newSession = data.session;
      if (newSession && typeof newSession.access_token === 'string') {
        await this.storeSession({
          access_token: newSession.access_token,
          refresh_token: newSession.refresh_token,
          expires_at: newSession.expires_at,
          user: newSession.user ?? null,
        });
      }

      // Success: keep snapshot status, clear lastError, bump updatedAt.
      this.snapshot = { ...this.snapshot, lastError: null, updatedAt: nowIso() };
      try { await writeSnapshot(this.snapshot); } catch { /* non-fatal */ }
      return this.getSnapshot();
    } catch (error) {
      return this.failSoft(error, 'identity/password-update-failed');
    }
  }

  // ─── device sessions (Phase 5.0E) ─────────────────────────────────────────
  // None of these methods mutate the public IdentitySnapshot — device-session
  // data is queried fresh on demand and cached in component state. All three
  // are best-effort: failures resolve to null / empty list and never raise.

  async registerDeviceSession(input: RegisterDeviceSessionInput): Promise<DeviceSession | null> {
    const config = getMobileSupabaseConfig();
    if (!config || !this.accessToken) return null;
    try {
      const cleanLabel = String(input.label || '').trim().replace(/\s+/g, ' ').slice(0, 64);
      if (!cleanLabel) return null;
      if (!ALLOWED_DEVICE_SURFACES.includes(input.surface)) return null;

      const { hashHex } = await this.ensureDeviceTokenAndHash();

      const authedClient = this.getAuthedClient(config);
      const { data, error } = await authedClient.rpc('register_device_session', {
        p_surface: input.surface,
        p_label: cleanLabel,
        p_device_token_hash: hashHex,
      });
      if (error) return null;

      const session = this.parseDeviceSessionPayload(
        (data as { session?: unknown } | null)?.session
      );
      if (session) {
        this.deviceSessionId = session.id;
      }
      return session;
    } catch {
      return null;
    }
  }

  async touchDeviceSession(): Promise<DeviceSession | null> {
    const config = getMobileSupabaseConfig();
    if (!config || !this.accessToken) return null;

    const now = Date.now();
    if (now - this.lastDeviceTouchAt < DEVICE_TOUCH_INTERVAL_MS) return null;

    try {
      const tokenHex = await readDeviceToken();
      if (!tokenHex || !/^[0-9a-f]{64}$/.test(tokenHex)) return null;
      const hashHex = await this.hashDeviceTokenHex(tokenHex);

      const authedClient = this.getAuthedClient(config);
      const { data, error } = await authedClient.rpc('touch_device_session', {
        p_device_token_hash: hashHex,
      });
      if (error) return null;

      this.lastDeviceTouchAt = now;
      const session = this.parseDeviceSessionPayload(
        (data as { session?: unknown } | null)?.session
      );
      if (session) {
        this.deviceSessionId = session.id;
      }
      return session;
    } catch {
      return null;
    }
  }

  // ─── Google OAuth (Phase 5.0F, gated on GOOGLE_OAUTH_VERIFIED in mobileConfig) ─
  // PKCE flow via Supabase JS + ASWebAuthenticationSession (iOS) /
  // CustomTabs (Android) through expo-web-browser. All sensitive material
  // (auth code, OAuth state, access/refresh tokens) is held in local
  // variables only; nothing is logged, persisted to AsyncStorage/audit, or
  // surfaced to the snapshot. Refresh token graduates to SecureStore via
  // the existing storeSession path; access token remains memory-only.
  async signInWithGoogle(): Promise<IdentitySnapshot> {
    const config = getMobileSupabaseConfig();
    if (!config) {
      return this.fail(
        createIdentityError('identity/provider-not-configured', 'Supabase config is not available.'),
        'identity/provider-not-configured',
        { persist: false, clearSession: true }
      );
    }
    try {
      const client = this.getClient(config);
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: MOBILE_OAUTH_REDIRECT_URI,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data || typeof data.url !== 'string' || !data.url) {
        throw createIdentityError(
          mapMobileOAuthErrorCode(error),
          'Google sign-in could not be initialized.'
        );
      }

      const browserResult = await WebBrowser.openAuthSessionAsync(data.url, MOBILE_OAUTH_REDIRECT_URI);
      if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
        return this.failSoft(
          createIdentityError('identity/oauth-cancelled', 'Google sign-in was cancelled.'),
          'identity/oauth-cancelled'
        );
      }
      if (browserResult.type !== 'success' || typeof browserResult.url !== 'string') {
        throw createIdentityError('identity/oauth-failed', 'Google sign-in did not complete.');
      }

      // Parse the authorization code from the redirect URL. Supabase sends back
      // `?code=…&…` (PKCE flow). The URL is held only in this local variable
      // and the parsed code is consumed immediately by exchangeCodeForSession.
      let code = '';
      try {
        const parsed = new URL(browserResult.url);
        code = String(parsed.searchParams.get('code') || '').trim();
      } catch {
        throw createIdentityError(
          'identity/oauth-callback-invalid',
          'Google sign-in returned an invalid response.'
        );
      }
      if (!code) {
        throw createIdentityError(
          'identity/oauth-callback-invalid',
          'Google sign-in returned an invalid response.'
        );
      }

      const exchange = await client.auth.exchangeCodeForSession(code);
      if (exchange.error || !exchange.data?.session) {
        throw createIdentityError(
          mapMobileOAuthErrorCode(exchange.error),
          'Google sign-in could not complete.'
        );
      }

      await this.storeSession(exchange.data.session);
      this.fireAndForgetRegisterDevice();

      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('load_identity_state');
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(
        rpcData as RpcIdentityState | null,
        this.normalizedEmailCandidate(
          exchange.data.session.user?.email,
          this.snapshot.profile?.email,
          this.snapshot.pendingEmail
        )
      );
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.failSoft(error, 'identity/oauth-failed');
    }
  }

  async listDeviceSessions(): Promise<ListDeviceSessionsResult> {
    const empty: ListDeviceSessionsResult = { sessions: [], currentSessionId: null };
    const config = getMobileSupabaseConfig();
    if (!config || !this.accessToken) return empty;
    try {
      // Lazy fallback: if the auto-register hooks haven't yet populated
      // deviceSessionId (e.g., user opens /account-identity right after a
      // fresh refresh), do a best-effort register first so the
      // current-device pill resolves correctly on first paint.
      if (!this.deviceSessionId) {
        await this.registerDeviceSession({
          surface: DEFAULT_MOBILE_SURFACE,
          label: DEFAULT_MOBILE_LABEL,
        });
      }

      const authedClient = this.getAuthedClient(config);
      const { data, error } = await authedClient.rpc('list_my_device_sessions');
      if (error) return empty;

      const rawList = (data as { sessions?: unknown } | null)?.sessions;
      if (!Array.isArray(rawList)) return empty;

      const sessions: DeviceSession[] = [];
      for (const item of rawList) {
        const parsed = this.parseDeviceSessionPayload(item);
        if (parsed) sessions.push(parsed);
      }
      return { sessions, currentSessionId: this.deviceSessionId };
    } catch {
      return empty;
    }
  }
}
