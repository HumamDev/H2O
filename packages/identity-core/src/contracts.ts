/**
 * H2O Identity Core — pure shared contracts.
 *
 * Phase 1/2 scope only:
 * - no real auth provider
 * - no real tokens
 * - no cloud profile tables
 * - no forced login gate
 */

export const H2O_IDENTITY_CORE_VERSION = '0.1.0' as const;

export type IdentityPublicState =
  | 'anonymous_local'
  | 'email_pending'
  | 'email_confirmation_pending'
  | 'verified_no_profile'
  | 'profile_ready'
  | 'sync_ready'
  | 'recovery_code_pending'
  | 'password_update_required'
  | 'auth_error';

export type IdentityInternalState =
  | 'booting'
  | 'refreshing_session'
  | 'handling_callback'
  | 'creating_profile';

export type IdentityProviderKind = 'mock_local' | 'supabase' | 'firebase' | 'clerk' | 'custom';

export type IdentityMode = 'local_dev' | 'provider_backed';

export interface IdentityErrorShape {
  code: string;
  message: string;
  detail?: unknown;
  at: string;
}

export interface H2OProfile {
  id: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarColor?: string;
  workspaceId: string;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface H2OWorkspace {
  id: string;
  ownerUserId: string;
  name: string;
  origin: 'local_mock' | 'provider_backed';
  createdAt: string;
  updatedAt: string;
}

export interface IdentitySnapshot {
  version: typeof H2O_IDENTITY_CORE_VERSION | string;
  status: IdentityPublicState;
  mode: IdentityMode;
  provider: IdentityProviderKind;
  pendingEmail?: string | null;
  emailVerified: boolean;
  profile?: H2OProfile | null;
  workspace?: H2OWorkspace | null;
  onboardingCompleted: boolean;
  lastError?: IdentityErrorShape | null;
  updatedAt: string;
}

export interface SignInEmailInput {
  email: string;
  redirectTo?: string;
  source?: string;
}

export interface SignInPasswordInput {
  email: string;
  password: string;
}

export interface SignUpPasswordInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface VerifyEmailCodeInput {
  email?: string;
  code: string;
}

export interface InitialWorkspaceInput {
  email?: string;
  displayName?: string;
  workspaceName?: string;
  avatarColor?: string;
}

export type ProfilePatch = Partial<Pick<H2OProfile, 'displayName' | 'avatarColor' | 'onboardingCompleted'>>;

export type DeviceSessionSurface =
  | 'ios_app'
  | 'android_app'
  | 'chrome_extension'
  | 'firefox_extension'
  | 'desktop_mac'
  | 'desktop_windows'
  | 'web';

export interface DeviceSession {
  id: string;
  surface: DeviceSessionSurface;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface RegisterDeviceSessionInput {
  surface: DeviceSessionSurface;
  label: string;
}

export interface ListDeviceSessionsResult {
  sessions: DeviceSession[];
  currentSessionId: string | null;
}

export interface ProviderCapabilities {
  emailMagicLink: boolean;
  emailOtp: boolean;
  profileRead: boolean;
  profileWrite: boolean;
  persistentSession: boolean;
  cloudSync: boolean;
}

export interface IdentityProvider {
  kind: IdentityProviderKind;
  mode: IdentityMode;
  capabilities: ProviderCapabilities;
  signInWithEmail(input: SignInEmailInput): Promise<IdentitySnapshot>;
  resendVerification(email: string): Promise<IdentitySnapshot>;
  verifyEmailCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot>;
  handleVerificationCallback(urlOrLocation?: string | Location | URL): Promise<IdentitySnapshot>;
  createInitialWorkspace(input: InitialWorkspaceInput): Promise<IdentitySnapshot>;
  refreshSession(): Promise<IdentitySnapshot>;
  signOut(): Promise<IdentitySnapshot>;
  getSnapshot(): IdentitySnapshot;
  updateProfile(patch: ProfilePatch): Promise<IdentitySnapshot>;
  signInWithPassword(input: SignInPasswordInput): Promise<IdentitySnapshot>;
  signUpWithPassword(input: SignUpPasswordInput): Promise<IdentitySnapshot>;
  verifySignupCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot>;
  requestRecoveryCode(email: string): Promise<IdentitySnapshot>;
  verifyRecoveryCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot>;
  setPasswordAfterRecovery(password: string): Promise<IdentitySnapshot>;
  changePassword(input: ChangePasswordInput): Promise<IdentitySnapshot>;
  renameWorkspace(name: string): Promise<IdentitySnapshot>;
  registerDeviceSession(input: RegisterDeviceSessionInput): Promise<DeviceSession | null>;
  touchDeviceSession(): Promise<DeviceSession | null>;
  listDeviceSessions(): Promise<ListDeviceSessionsResult>;
  signInWithGoogle(): Promise<IdentitySnapshot>;
  signInWithApple(): Promise<IdentitySnapshot>;
}

export type IdentityChangeSource =
  | 'boot'
  | 'storage'
  | 'signInWithEmail'
  | 'resendVerification'
  | 'verifyEmailCode'
  | 'handleVerificationCallback'
  | 'createInitialWorkspace'
  | 'enterLocalMode'
  | 'updateProfile'
  | 'refreshSession'
  | 'signOut'
  | 'error'
  | 'signInWithPassword'
  | 'signUpWithPassword'
  | 'verifySignupCode'
  | 'requestRecoveryCode'
  | 'verifyRecoveryCode'
  | 'setPasswordAfterRecovery'
  | 'changePassword'
  | 'renameWorkspace'
  | 'signInWithGoogle'
  | 'signInWithApple';

export interface IdentityChangeEvent {
  source: IdentityChangeSource;
  previous: IdentitySnapshot;
  current: IdentitySnapshot;
}

export type IdentityChangeListener = (event: IdentityChangeEvent) => void;
