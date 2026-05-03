import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ChangePasswordInput,
  H2OProfile,
  H2OWorkspace,
  IdentityErrorShape,
  IdentityMode,
  IdentityProvider,
  IdentityPublicState,
  IdentitySnapshot,
  InitialWorkspaceInput,
  ProfilePatch,
  ProviderCapabilities,
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
  sanitizeProfilePatch,
  transitionIdentity,
} from '@h2o/identity-core';
import { getMobileSupabaseConfig, type MobileSupabaseConfig } from './mobileConfig';
import { deleteRefreshToken, readRefreshToken, writeRefreshToken } from './secureStore';
import { clearAllIdentityStorage, writeSessionMeta, writeSnapshot } from './mobileStorage';
import { selfCheckIdentitySnapshot } from './selfCheck';

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
      const { data: rpcData, error: rpcError } = await authedClient.rpc('complete_onboarding', {
        display_name: input.displayName ?? null,
        workspace_name: input.workspaceName ?? null,
        avatar_color: input.avatarColor ?? null,
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
      if (!this.snapshot.profile) {
        throw createIdentityError('identity/no-profile', 'No profile exists to update.');
      }

      const clean = sanitizeProfilePatch(patch);
      const authedClient = this.getAuthedClient(config);
      const { data: rpcData, error: rpcError } = await authedClient.rpc('update_identity_profile', {
        display_name: clean.displayName ?? null,
        avatar_color: clean.avatarColor ?? null,
        onboarding_completed: clean.onboardingCompleted ?? null,
      });
      if (rpcError) throw rpcError;

      const snap = this.buildSnapshotFromRpc(rpcData as RpcIdentityState | null, this.snapshotEmailFallback());
      return this.commitSnapshot(snap);
    } catch (error) {
      return this.fail(error, 'identity/update-profile-failed');
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
    await deleteRefreshToken();
    await clearAllIdentityStorage();

    this.snapshot = createInitialIdentitySnapshot({ provider: 'mock_local' });
    try { await writeSnapshot(this.snapshot); } catch { /* non-fatal */ }
    return this.getSnapshot();
  }

  // ─── recovery stubs (gated — RECOVERY_FLOW_VERIFIED = false) ─────────────

  async requestRecoveryCode(_email: string): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError(
        'identity/recovery-flow-not-verified',
        'Recovery flow is pending live inbox verification.'
      ),
      'identity/recovery-flow-not-verified',
      { persist: false }
    );
  }

  async verifyRecoveryCode(_input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError(
        'identity/recovery-flow-not-verified',
        'Recovery flow is pending live inbox verification.'
      ),
      'identity/recovery-flow-not-verified',
      { persist: false }
    );
  }

  async setPasswordAfterRecovery(_password: string): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError(
        'identity/recovery-flow-not-verified',
        'Recovery flow is pending live inbox verification.'
      ),
      'identity/recovery-flow-not-verified',
      { persist: false }
    );
  }

  async changePassword(_input: ChangePasswordInput): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError(
        'identity/change-password-deferred',
        'Password change is not yet available on mobile.'
      ),
      'identity/change-password-deferred',
      { persist: false }
    );
  }
}
