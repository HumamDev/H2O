import type {
  ChangePasswordInput,
  DeviceSession,
  IdentityProvider,
  IdentitySnapshot,
  InitialWorkspaceInput,
  ListDeviceSessionsResult,
  ProfilePatch,
  RegisterDeviceSessionInput,
  SignInEmailInput,
  SignInPasswordInput,
  SignUpPasswordInput,
  VerifyEmailCodeInput
} from './contracts';
import { MOCK_LOCAL_CAPABILITIES } from './provider';
import {
  assertValidEmail,
  createIdentityError,
  createInitialIdentitySnapshot,
  normalizeEmail,
  nowIso,
  sanitizeProfilePatch,
  transitionIdentity
} from './state-machine';
import { createLocalProfileAndWorkspace } from './profile';

export class MockLocalIdentityProvider implements IdentityProvider {
  readonly kind = 'mock_local' as const;
  readonly mode = 'local_dev' as const;
  readonly capabilities = MOCK_LOCAL_CAPABILITIES;

  private snapshot: IdentitySnapshot;
  private mockDeviceSessions: DeviceSession[] = [];
  private mockCurrentSessionId: string | null = null;

  constructor(initial?: Partial<IdentitySnapshot>) {
    this.snapshot = { ...createInitialIdentitySnapshot({ provider: 'mock_local' }), ...initial, updatedAt: nowIso() };
  }

  getSnapshot(): IdentitySnapshot {
    return structuredCloneSafe(this.snapshot);
  }

  async signInWithEmail(input: SignInEmailInput): Promise<IdentitySnapshot> {
    try {
      const email = assertValidEmail(input.email);
      this.snapshot = transitionIdentity(this.snapshot, 'email_pending', {
        pendingEmail: email,
        provider: 'mock_local',
        mode: 'local_dev'
      });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-sign-in-failed');
    }
  }

  async resendVerification(email: string): Promise<IdentitySnapshot> {
    try {
      const normalized = assertValidEmail(email || this.snapshot.pendingEmail || '');
      this.snapshot = transitionIdentity(this.snapshot, 'email_pending', { pendingEmail: normalized });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-resend-failed');
    }
  }

  async verifyEmailCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    try {
      const email = normalizeEmail(input.email || this.snapshot.pendingEmail || '');
      if (!email) throw createIdentityError('identity/missing-email', 'No pending email exists to verify.');
      if (!String(input.code || '').trim()) throw createIdentityError('identity/missing-code', 'Enter a mock verification code.');

      this.snapshot = transitionIdentity(this.snapshot, 'verified_no_profile', {
        pendingEmail: email,
        emailVerified: true
      });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-verify-failed');
    }
  }

  async handleVerificationCallback(urlOrLocation?: string | Location | URL): Promise<IdentitySnapshot> {
    try {
      const url = parseMaybeUrl(urlOrLocation);
      const email = normalizeEmail(url?.searchParams.get('email') || this.snapshot.pendingEmail || '');
      if (!email) throw createIdentityError('identity/missing-callback-email', 'No email found in mock callback or pending state.');

      this.snapshot = transitionIdentity(this.snapshot, 'verified_no_profile', {
        pendingEmail: email,
        emailVerified: true
      });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-callback-failed');
    }
  }

  async createInitialWorkspace(input: InitialWorkspaceInput): Promise<IdentitySnapshot> {
    try {
      const email = assertValidEmail(input.email || this.snapshot.pendingEmail || 'local-user@h2o.local');
      const { profile, workspace } = createLocalProfileAndWorkspace({ ...input, email });
      this.snapshot = transitionIdentity(this.snapshot, 'profile_ready', {
        pendingEmail: null,
        profile,
        workspace,
        emailVerified: true,
        onboardingCompleted: true
      });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-profile-create-failed');
    }
  }

  async refreshSession(): Promise<IdentitySnapshot> {
    this.snapshot = { ...this.snapshot, updatedAt: nowIso() };
    return this.getSnapshot();
  }

  async signOut(): Promise<IdentitySnapshot> {
    this.snapshot = transitionIdentity(this.snapshot, 'anonymous_local');
    this.mockDeviceSessions = [];
    this.mockCurrentSessionId = null;
    return this.getSnapshot();
  }

  async updateProfile(patch: ProfilePatch): Promise<IdentitySnapshot> {
    try {
      if (!this.snapshot.profile) throw createIdentityError('identity/no-profile', 'No profile exists to update.');
      const clean = sanitizeProfilePatch(patch);
      const profile = { ...this.snapshot.profile, ...clean, updatedAt: nowIso() };
      this.snapshot = transitionIdentity(this.snapshot, this.snapshot.status, { profile });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-profile-update-failed');
    }
  }

  async signInWithPassword(input: SignInPasswordInput): Promise<IdentitySnapshot> {
    try {
      const email = assertValidEmail(input.email);
      if (!String(input.password || '').trim()) throw createIdentityError('identity/missing-password', 'Enter a password.');
      const next = this.snapshot.profile ? 'sync_ready' : 'verified_no_profile' as const;
      this.snapshot = transitionIdentity(this.snapshot, next, { pendingEmail: email, emailVerified: true });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-password-sign-in-failed');
    }
  }

  async signUpWithPassword(input: SignUpPasswordInput): Promise<IdentitySnapshot> {
    try {
      const email = assertValidEmail(input.email);
      if (!String(input.password || '').trim()) throw createIdentityError('identity/missing-password', 'Enter a password.');
      this.snapshot = transitionIdentity(this.snapshot, 'email_confirmation_pending', { pendingEmail: email });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-signup-failed');
    }
  }

  async verifySignupCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    try {
      const email = normalizeEmail(input.email || this.snapshot.pendingEmail || '');
      if (!email) throw createIdentityError('identity/missing-email', 'No pending email to verify.');
      if (!String(input.code || '').trim()) throw createIdentityError('identity/missing-code', 'Enter a verification code.');
      this.snapshot = transitionIdentity(this.snapshot, 'verified_no_profile', { pendingEmail: email, emailVerified: true });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-verify-signup-failed');
    }
  }

  async requestRecoveryCode(_email: string): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError('identity/recovery-flow-not-verified', 'Recovery flow is pending live inbox verification.'),
      'identity/recovery-flow-not-verified'
    );
  }

  async verifyRecoveryCode(_input: VerifyEmailCodeInput): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError('identity/recovery-flow-not-verified', 'Recovery flow is pending live inbox verification.'),
      'identity/recovery-flow-not-verified'
    );
  }

  async setPasswordAfterRecovery(_password: string): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError('identity/recovery-flow-not-verified', 'Recovery flow is pending live inbox verification.'),
      'identity/recovery-flow-not-verified'
    );
  }

  async changePassword(input: ChangePasswordInput): Promise<IdentitySnapshot> {
    try {
      if (!String(input.currentPassword || '').trim()) throw createIdentityError('identity/missing-current-password', 'Enter your current password.');
      if (!String(input.newPassword || '').trim()) throw createIdentityError('identity/missing-new-password', 'Enter a new password.');
      this.snapshot = { ...this.snapshot, updatedAt: nowIso() };
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-change-password-failed');
    }
  }

  async registerDeviceSession(input: RegisterDeviceSessionInput): Promise<DeviceSession | null> {
    if (!this.snapshot.profile) return null;
    const now = nowIso();
    const existing = this.mockDeviceSessions.find((s) => s.surface === input.surface && s.label === input.label);
    if (existing) {
      existing.lastSeenAt = now;
      existing.revokedAt = null;
      this.mockCurrentSessionId = existing.id;
      return { ...existing };
    }
    const session: DeviceSession = {
      id: `mock-session-${this.mockDeviceSessions.length + 1}`,
      surface: input.surface,
      label: input.label,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    this.mockDeviceSessions.push(session);
    this.mockCurrentSessionId = session.id;
    return { ...session };
  }

  async touchDeviceSession(): Promise<DeviceSession | null> {
    if (!this.mockCurrentSessionId) return null;
    const session = this.mockDeviceSessions.find((s) => s.id === this.mockCurrentSessionId);
    if (!session) return null;
    session.lastSeenAt = nowIso();
    return { ...session };
  }

  async listDeviceSessions(): Promise<ListDeviceSessionsResult> {
    return {
      sessions: this.mockDeviceSessions.filter((s) => !s.revokedAt).map((s) => ({ ...s })),
      currentSessionId: this.mockCurrentSessionId,
    };
  }

  async signInWithGoogle(): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError('identity/oauth-not-supported', 'Google sign-in is not available in the local mock provider.'),
      'identity/oauth-not-supported'
    );
  }

  async signInWithApple(): Promise<IdentitySnapshot> {
    return this.fail(
      createIdentityError('identity/apple-not-supported', 'Apple sign-in is not available in the local mock provider.'),
      'identity/apple-not-supported'
    );
  }

  async renameWorkspace(name: string): Promise<IdentitySnapshot> {
    try {
      if (!this.snapshot.workspace) throw createIdentityError('identity/no-workspace', 'No workspace exists to rename.');
      const cleanName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!cleanName) throw createIdentityError('identity/missing-workspace-name', 'Enter a workspace name.');
      const workspace = { ...this.snapshot.workspace, name: cleanName, updatedAt: nowIso() };
      this.snapshot = transitionIdentity(this.snapshot, this.snapshot.status, { workspace });
      return this.getSnapshot();
    } catch (error) {
      return this.fail(error, 'identity/mock-rename-workspace-failed');
    }
  }

  private fail(error: unknown, fallbackCode: string): IdentitySnapshot {
    const identityError = isIdentityError(error)
      ? error
      : createIdentityError(fallbackCode, error instanceof Error ? error.message : 'Identity operation failed.', error);

    this.snapshot = transitionIdentity(this.snapshot, 'auth_error', { lastError: identityError });
    return this.getSnapshot();
  }
}

function parseMaybeUrl(value?: string | Location | URL): URL | null {
  if (!value) return null;
  if (value instanceof URL) return value;
  if (typeof Location !== 'undefined' && value instanceof Location) return new URL(value.href);
  if (typeof value === 'string') return new URL(value, 'https://local.h2o.invalid');
  return null;
}

function isIdentityError(value: unknown): value is ReturnType<typeof createIdentityError> {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value && 'at' in value);
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
