import type {
  IdentityErrorShape,
  IdentityPublicState,
  IdentitySnapshot,
  IdentityProviderKind,
  H2OProfile,
  H2OWorkspace,
  ProfilePatch
} from './contracts';
import { H2O_IDENTITY_CORE_VERSION } from './contracts';

export const IDENTITY_PUBLIC_STATES: readonly IdentityPublicState[] = [
  'anonymous_local',
  'email_pending',
  'email_confirmation_pending',
  'verified_no_profile',
  'profile_ready',
  'sync_ready',
  'recovery_code_pending',
  'password_update_required',
  'auth_error'
] as const;

const ALLOWED_TRANSITIONS: Record<IdentityPublicState, readonly IdentityPublicState[]> = {
  anonymous_local: ['anonymous_local', 'email_pending', 'email_confirmation_pending', 'recovery_code_pending', 'verified_no_profile', 'profile_ready', 'sync_ready', 'auth_error'],
  email_pending: ['email_pending', 'verified_no_profile', 'anonymous_local', 'auth_error'],
  email_confirmation_pending: ['email_confirmation_pending', 'verified_no_profile', 'anonymous_local', 'auth_error'],
  verified_no_profile: ['verified_no_profile', 'profile_ready', 'anonymous_local', 'auth_error'],
  profile_ready: ['profile_ready', 'sync_ready', 'anonymous_local', 'auth_error'],
  sync_ready: ['sync_ready', 'profile_ready', 'anonymous_local', 'auth_error'],
  recovery_code_pending: ['recovery_code_pending', 'password_update_required', 'anonymous_local', 'auth_error'],
  password_update_required: ['password_update_required', 'sync_ready', 'anonymous_local', 'auth_error'],
  auth_error: ['anonymous_local', 'email_pending', 'email_confirmation_pending', 'verified_no_profile', 'profile_ready', 'recovery_code_pending', 'auth_error']
};

const PROFILE_AVATAR_COLORS = ['violet', 'blue', 'cyan', 'green', 'amber', 'pink'] as const;
const PROFILE_AVATAR_HEX_TO_SLUG: Record<string, typeof PROFILE_AVATAR_COLORS[number]> = {
  '#7c3aed': 'violet',
  '#2563eb': 'blue',
  '#0891b2': 'cyan',
  '#059669': 'green',
  '#d97706': 'amber',
  '#db2777': 'pink',
};

function normalizeProfileAvatarColor(input?: string): string {
  const clean = String(input || '').trim().toLowerCase();
  if (!clean) return '';
  if ((PROFILE_AVATAR_COLORS as readonly string[]).includes(clean)) return clean;
  return PROFILE_AVATAR_HEX_TO_SLUG[clean] || '';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isIdentityPublicState(value: unknown): value is IdentityPublicState {
  return typeof value === 'string' && (IDENTITY_PUBLIC_STATES as readonly string[]).includes(value);
}

export function canTransitionIdentity(from: IdentityPublicState, to: IdentityPublicState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createIdentityError(code: string, message: string, detail?: unknown): IdentityErrorShape {
  return { code, message, detail, at: nowIso() };
}

export function createInitialIdentitySnapshot(options?: {
  provider?: IdentityProviderKind;
  profile?: H2OProfile | null;
  workspace?: H2OWorkspace | null;
  status?: IdentityPublicState;
  pendingEmail?: string | null;
}): IdentitySnapshot {
  const profile = options?.profile ?? null;
  const workspace = options?.workspace ?? null;
  const status = options?.status ?? (profile ? 'profile_ready' : 'anonymous_local');

  return {
    version: H2O_IDENTITY_CORE_VERSION,
    status,
    mode: options?.provider && options.provider !== 'mock_local' ? 'provider_backed' : 'local_dev',
    provider: options?.provider ?? 'mock_local',
    pendingEmail: options?.pendingEmail ?? null,
    emailVerified: Boolean(profile?.emailVerified),
    profile,
    workspace,
    onboardingCompleted: Boolean(profile?.onboardingCompleted),
    lastError: null,
    updatedAt: nowIso()
  };
}

export function transitionIdentity(
  previous: IdentitySnapshot,
  nextStatus: IdentityPublicState,
  patch: Partial<IdentitySnapshot> = {}
): IdentitySnapshot {
  if (!canTransitionIdentity(previous.status, nextStatus)) {
    return {
      ...previous,
      status: 'auth_error',
      lastError: createIdentityError(
        'identity/invalid-transition',
        `Invalid identity transition: ${previous.status} -> ${nextStatus}`,
        { from: previous.status, to: nextStatus }
      ),
      updatedAt: nowIso()
    };
  }

  const next: IdentitySnapshot = {
    ...previous,
    ...patch,
    status: nextStatus,
    updatedAt: nowIso()
  };

  next.emailVerified = Boolean(next.profile?.emailVerified || nextStatus === 'verified_no_profile' || nextStatus === 'profile_ready' || nextStatus === 'sync_ready');
  next.onboardingCompleted = Boolean(next.profile?.onboardingCompleted || nextStatus === 'profile_ready' || nextStatus === 'sync_ready');

  if (nextStatus !== 'auth_error') next.lastError = patch.lastError ?? null;
  if (nextStatus === 'anonymous_local') {
    next.pendingEmail = null;
    next.profile = null;
    next.workspace = null;
    next.emailVerified = false;
    next.onboardingCompleted = false;
  }

  return next;
}

export function normalizeEmail(input: string): string {
  return String(input || '').trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const email = normalizeEmail(input);
  if (email.length < 6 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function assertValidEmail(input: string): string {
  const email = normalizeEmail(input);
  if (!isValidEmail(email)) {
    throw createIdentityError('identity/invalid-email', 'Enter a valid email address.', { input });
  }
  return email;
}

export function sanitizeProfilePatch(patch: ProfilePatch): ProfilePatch {
  const clean: ProfilePatch = {};

  if (typeof patch.displayName === 'string') {
    const displayName = patch.displayName.trim().replace(/\s+/g, ' ');
    if (displayName) clean.displayName = displayName.slice(0, 80);
  }

  if (typeof patch.avatarColor === 'string') {
    const avatarColor = normalizeProfileAvatarColor(patch.avatarColor);
    if (avatarColor) clean.avatarColor = avatarColor;
  }

  if (typeof patch.onboardingCompleted === 'boolean') {
    clean.onboardingCompleted = patch.onboardingCompleted;
  }

  return clean;
}

export function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  const [name, domain] = normalized.split('@');
  if (!name || !domain) return '***';
  const visible = name.length <= 2 ? name[0] ?? '*' : `${name[0]}${name[name.length - 1]}`;
  return `${visible}***@${domain}`;
}
